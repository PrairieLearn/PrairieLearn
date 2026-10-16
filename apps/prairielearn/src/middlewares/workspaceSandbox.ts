import bodyParser from 'body-parser';
import {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  Router,
} from 'express';
import asyncHandler from 'express-async-handler';

import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { idsEqual } from '../lib/id.js';
import {
  WORKSPACE_SANDBOX_COOKIE_NAME,
  type WorkspaceSandboxHost,
  classifyWorkspaceSandboxRequestHost,
  generateWorkspaceSandboxCookie,
  getAuthorizedWorkspaceSandboxHost,
  getTrustedPrairieLearnOrigin,
  getWorkspaceSandboxCookieMaxAgeMilliseconds,
  verifyWorkspaceSandboxBootstrapJwt,
} from '../lib/workspace-sandbox.js';

import { makeWorkspaceProxyMiddleware } from './workspaceProxy.js';

const WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE =
  'prairielearn:workspace-authorization-expired';

const CONTAINER_PATH_REGEX = /^\/pl\/workspace\/([0-9]+)\/container\/(.*)/;

function getWorkspaceSandboxResponseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `frame-ancestors ${getTrustedPrairieLearnOrigin()};`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendAuthorizationExpired(res: Response) {
  const message = JSON.stringify({ type: WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE });
  const targetOrigin = JSON.stringify(getTrustedPrairieLearnOrigin());
  res.status(401).type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Workspace authorization expired</title></head>
  <body>
    <p>Workspace authorization expired. Return to PrairieLearn to reconnect.</p>
    <script>window.parent.postMessage(${message}, ${targetOrigin});</script>
  </body>
</html>`);
}

function getWorkspaceHost(res: Response): Extract<WorkspaceSandboxHost, { type: 'workspace' }> {
  return res.locals.workspaceSandboxHost;
}

function validateWorkspaceSandboxCookie(req: Request, res: Response, next: NextFunction) {
  const workspaceHost = getWorkspaceHost(res);
  const workspaceId = IdSchema.safeParse(req.params.workspace_id);
  if (!workspaceId.success || !idsEqual(workspaceId.data, workspaceHost.workspaceId)) {
    res.status(404).send('Not Found');
    return;
  }

  const authorizedHost = getAuthorizedWorkspaceSandboxHost(req);
  if (authorizedHost == null || !idsEqual(authorizedHost.workspaceId, workspaceHost.workspaceId)) {
    sendAuthorizationExpired(res);
    return;
  }

  next();
}

export function makeWorkspaceSandboxMiddleware({
  onProxyRequest,
}: {
  onProxyRequest?: (req: Request) => void;
} = {}) {
  const router = Router();
  const responseHeaders = getWorkspaceSandboxResponseHeaders();

  router.use((req, res, next) => {
    const workspaceHost = classifyWorkspaceSandboxRequestHost(req);
    if (workspaceHost.type === 'not-sandbox') return next('router');

    res.set(responseHeaders);
    if (workspaceHost.type === 'invalid-sandbox-host') {
      res.status(404).send('Not Found');
      return;
    }

    res.locals.workspaceSandboxHost = workspaceHost;
    next();
  });

  router.post(
    '/bootstrap',
    bodyParser.urlencoded({ extended: false, limit: '1kb' }),
    asyncHandler(async (req, res) => {
      const workspaceHost = getWorkspaceHost(res);
      const jwt = req.body?.jwt;
      if (typeof jwt !== 'string') {
        res.status(403).send('Unable to authorize workspace');
        return;
      }

      const payload = await verifyWorkspaceSandboxBootstrapJwt(jwt);
      if (payload == null || !idsEqual(payload.workspace_id, workspaceHost.workspaceId)) {
        res.status(403).send('Unable to authorize workspace');
        return;
      }

      res.cookie(
        WORKSPACE_SANDBOX_COOKIE_NAME,
        generateWorkspaceSandboxCookie({
          workspaceId: payload.workspace_id,
        }),
        {
          httpOnly: true,
          maxAge: getWorkspaceSandboxCookieMaxAgeMilliseconds(),
          partitioned: true,
          path: '/',
          sameSite: 'none',
          secure: true,
        },
      );
      res.redirect(303, `/pl/workspace/${payload.workspace_id}/container/`);
    }),
  );

  router.use(
    '/pl/workspace/:workspace_id(\\d+)/container',
    validateWorkspaceSandboxCookie,
    (req, _res, next) => {
      onProxyRequest?.(req);
      next();
    },
    makeWorkspaceProxyMiddleware(CONTAINER_PATH_REGEX, {
      cookieDomainRewrite: '',
      removeResponseHeaders: ['X-Frame-Options'],
      responseHeaders,
    }),
  );

  router.use((_req, res) => {
    res.status(404).send('Not Found');
  });

  router.use(((err, req, res, next) => {
    if (classifyWorkspaceSandboxRequestHost(req).type === 'not-sandbox') {
      next(err);
      return;
    }

    Sentry.captureException(err);
    res.status(500).send('Workspace request failed');
  }) satisfies ErrorRequestHandler);

  return router;
}
