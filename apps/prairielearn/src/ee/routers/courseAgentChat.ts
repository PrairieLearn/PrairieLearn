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

const router = Router({ mergeParams: true });
const RequestSchemas = {
  params: z.object({ course_id: IdSchema, conversation_id: IdSchema }),
  query: z.object({ csrfToken: z.string().optional() }),
};
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
  if (!/^\/pl\/course\/\d+\/course_agent\/conversations\/\d+(?:\?|$)/.test(req.url ?? '')) return;
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

router.get(
  ['/conversations/:conversation_id', '/conversations/:conversation_id/get-messages'],
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
    // WebSocket handshakes are GET requests too; router.get does not guarantee an upgrade.
    // Ordinary HTTP GET is supported only for the saved-history endpoint.
    if (!head && !req.path.endsWith('/get-messages')) {
      res.sendStatus(426);
      return;
    }
    const path = `conversations/${conversation.agent_conversation_id}${head ? '' : '/get-messages'}`;
    const { url, headers } = buildCourseAgentServiceRequest(path);
    // Keep the SDK connection ID, but never forward the browser's CSRF token or cookies.
    url.search = new URL(req.originalUrl, url).search;
    url.searchParams.delete('csrfToken');
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

export default router;
