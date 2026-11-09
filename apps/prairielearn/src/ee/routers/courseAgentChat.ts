import type { IncomingMessage } from 'node:http';

import { type Express, type Request, type Response, Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { checkSignedTokenPrefix } from '@prairielearn/signed-token';
import { IdSchema, parseRequestParams, parseRequestQuery } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { createUpgradeResponse } from '../../lib/http-upgrade.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { buildCourseAgentServiceRequest } from '../lib/course-agent/client.js';
import { selectOptionalCourseAgentConversation } from '../models/course-agent-conversation.js';

/** Matches the live-chat URL, with optional query parameters. */
const CHAT_UPGRADE_PATH = /^\/pl\/course\/\d+\/course_agent\/conversations\/\d+(?:\?|$)/;

const router = Router({ mergeParams: true });
const ParamsSchema = z.object({ course_id: IdSchema, conversation_id: IdSchema });
const ChatQuerySchema = z.object({ csrfToken: z.string().optional() });
const UploadParamsSchema = z.object({ upload_id: z.uuid() });

/**
 * Saves any bytes Node already received after an upgrade request until the proxy takes over.
 * Every upgrade request gets an entry, even when its buffer is empty.
 */
const upgradeHeads = new WeakMap<IncomingMessage, Buffer>();

function createProxy(onResponse?: (response: IncomingMessage) => void) {
  return createProxyMiddleware<Request, Response>({
    // Upgrades are forwarded explicitly, after the Express authorization chain.
    ws: false,
    changeOrigin: true,
    router: () => new URL(config.courseAgentServiceUrl!).origin,
    on: {
      proxyRes: onResponse,
      error: (err, _req, res) => {
        logger.error('Course agent proxy failed', err);
        if ('writeHead' in res) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('The course agent is unavailable.');
        } else {
          res.destroy();
        }
      },
    },
  });
}

const proxy = createProxy();

const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Uploaded files are served from PrairieLearn's origin, so none may render as a page here,
 * whatever the agent service sends: an image may display, and anything else downloads.
 */
const uploadProxy = createProxy((response) => {
  const type = response.headers['content-type'];
  const image = type !== undefined && INLINE_IMAGE_TYPES.has(type);
  response.headers['content-type'] = image ? type : 'application/octet-stream';
  response.headers['content-disposition'] = image ? 'inline' : 'attachment';
  response.headers['content-security-policy'] =
    "default-src 'none'; frame-ancestors 'none'; sandbox";
  response.headers['x-content-type-options'] = 'nosniff';
});

/** Send upgrades through the same session/authentication/RBAC chain as HTTP. */
export function handleCourseAgentUpgrade(app: Express, req: IncomingMessage, head: Buffer) {
  if (!CHAT_UPGRADE_PATH.test(req.url ?? '')) return false;
  const res = createUpgradeResponse(req);
  if (!res) return true;
  upgradeHeads.set(req, head);
  app(req, res);
  return true;
}

async function prepareConversationProxyRequest(
  req: Request,
  res: Response<unknown, ResLocalsForPage<'course'>>,
  servicePathSuffix: string,
) {
  const params = parseRequestParams(req, ParamsSchema);
  if (!(await courseAgentEnabled(res.locals))) {
    throw new HttpStatusError(403, 'The course agent is not available in this course.');
  }
  const { authn_user, course } = extractPageContext(res.locals, {
    pageType: 'course',
    accessType: 'instructor',
  });
  const conversation = await selectOptionalCourseAgentConversation({
    id: params.conversation_id,
    course_id: params.course_id,
    user_id: authn_user.id,
  });
  if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');

  // Translate the PL conversation ID to its Cloudflare UUID.
  // Keep the path relative to preserve any configured service URL prefix.
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${conversation.agent_conversation_id}${servicePathSuffix}`,
  );
  // Preserve SDK query parameters, but remove PL's CSRF token.
  url.search = new URL(req.originalUrl, url).search;
  url.searchParams.delete('csrfToken');
  // Forward this path and query to the configured Cloudflare service.
  req.url = url.pathname + url.search;
  delete req.headers.cookie;
  req.headers.authorization = headers.Authorization;
  req.headers['x-pl-user-id'] = authn_user.id;
  req.headers['x-pl-course-context'] = encodeURIComponent(
    JSON.stringify({
      courseTitle: course.title ?? '',
      courseShortName: course.short_name,
    }),
  );
  return authn_user.id;
}

// Establish a WebSocket connection to send messages, stream replies, resume, and stop.
router.get(
  '/conversations/:conversation_id',
  typedAsyncHandler<'course'>(async (req, res) => {
    const query = parseRequestQuery(req, ChatQuerySchema);
    const userId = await prepareConversationProxyRequest(req, res, '');
    const head = upgradeHeads.get(req);
    // Reject ordinary HTTP requests sent to a WebSocket upgrade endpoint.
    if (!head) {
      res.sendStatus(426);
      return;
    }
    if (
      !query.csrfToken ||
      !checkSignedTokenPrefix(
        query.csrfToken,
        { url: req.originalUrl.split('?')[0], authn_user_id: userId },
        config.secretKey,
      )
    ) {
      throw new HttpStatusError(403, 'CSRF fail');
    }

    // Transfer ownership of the socket to the proxy.
    res.detachSocket(req.socket);
    // Status code 101 means Switching Protocols.
    res.statusCode = 101;
    res.emit('close');
    proxy.upgrade(req, req.socket, head);
  }),
);

// Stream one attachment to the agent service, which enforces the size limits and returns its
// upload ID. The browser sends raw bytes as application/octet-stream, so PrairieLearn's body
// parsers leave the stream untouched.
router.post(
  '/conversations/:conversation_id/uploads',
  typedAsyncHandler<'course'>(async (req, res, next) => {
    await prepareConversationProxyRequest(req, res, '/uploads');
    await proxy(req, res, next);
  }),
);

/** Forward a request about one upload, after checking its ID so it can't change the path. */
function proxyUpload(servicePathSuffix: '' | '/thumbnail') {
  return typedAsyncHandler<'course'>(async (req, res, next) => {
    const { upload_id } = parseRequestParams(req, UploadParamsSchema);
    await prepareConversationProxyRequest(req, res, `/uploads/${upload_id}${servicePathSuffix}`);
    await uploadProxy(req, res, next);
  });
}

router.get('/conversations/:conversation_id/uploads/:upload_id', proxyUpload(''));
router.get(
  '/conversations/:conversation_id/uploads/:upload_id/thumbnail',
  proxyUpload('/thumbnail'),
);
// The agent service enforces the thumbnail's size and type, like an upload's size.
router.post(
  '/conversations/:conversation_id/uploads/:upload_id/thumbnail',
  proxyUpload('/thumbnail'),
);

// Return saved message history as JSON.
router.get(
  '/conversations/:conversation_id/get-messages',
  typedAsyncHandler<'course'>(async (req, res, next) => {
    await prepareConversationProxyRequest(req, res, '/get-messages');
    // Forward requests to the Cloudflare Worker.
    await proxy(req, res, next);
  }),
);

export default router;
