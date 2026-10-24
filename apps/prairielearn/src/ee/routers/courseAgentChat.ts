import { type IncomingMessage, type Server, ServerResponse } from 'node:http';

import { type Express, type Request, type Response, Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { checkSignedTokenPrefix } from '@prairielearn/signed-token';
import { IdSchema, parseRequest } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { buildCourseAgentServiceRequest } from '../lib/course-agent/client.js';
import { selectOptionalCourseAgentConversation } from '../models/course-agent-conversation.js';

const conversationEndpoints = [
  {
    // Establish a WebSocket connection to send messages, stream replies, resume, and stop.
    path: '/conversations/:conversation_id',
    connectionType: 'websocket',
  },
  {
    // Return saved message history as JSON.
    path: '/conversations/:conversation_id/get-messages',
    connectionType: 'http',
  },
] as const;

/** Match WebSocket endpoints with numeric PL IDs and optional query parameters. */
const upgradePaths = conversationEndpoints
  .filter((endpoint) => endpoint.connectionType === 'websocket')
  .map(
    (endpoint) =>
      new RegExp(
        `^/pl/course/\\d+/course_agent${endpoint.path.replace(':conversation_id', '\\d+')}(?:\\?|$)`,
      ),
  );

const router = Router({ mergeParams: true });
const RequestSchemas = {
  params: z.object({ course_id: IdSchema, conversation_id: IdSchema }),
  query: z.object({ csrfToken: z.string().optional() }),
};
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
  if (!upgradePaths.some((pattern) => pattern.test(req.url ?? ''))) return;
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

for (const endpoint of conversationEndpoints) {
  router.get(
    endpoint.path,
    typedAsyncHandler<'course'>(async (req, res, next) => {
      const { params, query } = parseRequest(req, RequestSchemas);
      if (!(await courseAgentEnabled(res.locals))) {
        throw new HttpStatusError(403, 'The course agent is not available in this course.');
      }
      const { authn_user, course } = extractPageContext(res.locals, {
        pageType: 'course',
        accessType: 'instructor',
      });
      const head = upgradeHeads.get(req);
      if (
        head &&
        (!query.csrfToken ||
          !checkSignedTokenPrefix(
            query.csrfToken,
            { url: req.originalUrl.split('?')[0], authn_user_id: authn_user.id },
            config.secretKey,
          ))
      ) {
        throw new HttpStatusError(403, 'CSRF fail');
      }
      const conversation = await selectOptionalCourseAgentConversation({
        id: params.conversation_id,
        course_id: params.course_id,
        user_id: authn_user.id,
      });
      if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
      // No map entry means this is an ordinary HTTP request, not a WebSocket upgrade.
      if (endpoint.connectionType === 'websocket' && !head) {
        res.sendStatus(426);
        return;
      }
      // Translate the PL conversation ID to its Cloudflare UUID.
      // Keep the path relative to preserve any configured service URL prefix.
      const path = endpoint.path
        .replace(':conversation_id', conversation.agent_conversation_id)
        .slice(1);
      const { url, headers } = buildCourseAgentServiceRequest(path);
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
      if (head) {
        res.detachSocket(req.socket);
        // Finish Express request accounting; the proxy now owns the long-lived socket.
        res.statusCode = 101;
        res.emit('close');
        proxy.upgrade(req, req.socket, head);
      } else {
        await proxy(req, res, next);
      }
    }),
  );
}

export default router;
