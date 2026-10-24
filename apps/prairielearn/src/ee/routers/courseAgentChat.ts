import { type IncomingMessage, type Server, ServerResponse } from 'node:http';

import { type Express, type Request, type Response, Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { checkSignedTokenPrefix } from '@prairielearn/signed-token';
import { IdSchema, parseRequestParams, parseRequestQuery } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { buildCourseAgentServiceRequest } from '../lib/course-agent/client.js';
import { selectOptionalCourseAgentConversation } from '../models/course-agent-conversation.js';

/** Matches the live-chat URL, with optional query parameters. */
const CHAT_UPGRADE_PATH = /^\/pl\/course\/\d+\/course_agent\/conversations\/\d+(?:\?|$)/;

const router = Router({ mergeParams: true });
const ParamsSchema = z.object({ course_id: IdSchema, conversation_id: IdSchema });
const ChatQuerySchema = z.object({ csrfToken: z.string().optional() });

/**
 * Saves any bytes Node already received after an upgrade request until the proxy takes over.
 * Every upgrade request gets an entry, even when its buffer is empty.
 */
const upgradeHeads = new WeakMap<IncomingMessage, Buffer>();

const proxy = createProxyMiddleware<Request, Response>({
  // Upgrades are forwarded explicitly, after the Express authorization chain.
  ws: false,
  changeOrigin: true,
  router: () => new URL(config.courseAgentServiceUrl!).origin,
  on: {
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

/** Send upgrades through the same session/authentication/RBAC chain as HTTP. */
export function handleCourseAgentUpgrade(app: Express, req: IncomingMessage, head: Buffer) {
  if (!CHAT_UPGRADE_PATH.test(req.url ?? '')) return;
  upgradeHeads.set(req, head);
  const res = new ServerResponse(req);
  res.assignSocket(req.socket);
  // A rejected upgrade is an HTTP response on a socket outside Node's request loop.
  res.shouldKeepAlive = false;
  res.once('finish', () => req.socket.end());
  app(req, res);
}

export function initCourseAgentProxy(server: Server, app: Express) {
  server.on('upgrade', (req, _socket, head) => handleCourseAgentUpgrade(app, req, head));
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
  req.headers['x-pl-course-context'] = JSON.stringify({
    courseTitle: course.title ?? '',
    courseShortName: course.short_name,
  });
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
    // Finish Express request accounting before the proxy takes over.
    res.statusCode = 101;
    res.emit('close');
    proxy.upgrade(req, req.socket, head);
  }),
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
