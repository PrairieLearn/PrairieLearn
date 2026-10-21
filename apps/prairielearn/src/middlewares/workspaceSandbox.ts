import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  Router,
} from 'express';
import asyncHandler from 'express-async-handler';

import * as Sentry from '@prairielearn/sentry';
import { loadExistingSession } from '@prairielearn/session';

import { config } from '../lib/config.js';
import { idsEqual } from '../lib/id.js';
import { PostgresSessionStore } from '../lib/session-store.js';
import { extendSessionExpirationIfNeeded } from '../lib/session.js';
import {
  WORKSPACE_SANDBOX_COOKIE_NAME,
  WORKSPACE_SANDBOX_SESSION_COOKIE_NAME,
  type WorkspaceSandboxHost,
  type WorkspaceSandboxSession,
  classifyWorkspaceSandboxRequestHost,
  generateWorkspaceSandboxCookie,
  generateWorkspaceSandboxSessionCookie,
  getTrustedPrairieLearnOrigin,
  getWorkspaceSandboxCookieMaxAgeMilliseconds,
  getWorkspaceSandboxSession,
  getWorkspaceSandboxSessionCookieMaxAgeMilliseconds,
  isWorkspaceIsolationEnabled,
  validateWorkspaceSandboxAccess,
  validateWorkspaceSandboxWebSocketAccess,
  verifyWorkspaceSandboxBootstrapJwt,
} from '../lib/workspace-sandbox.js';

import authn from './authn.js';
import authzWorkspace from './authzWorkspace.js';
import date from './date.js';
import { makeWorkspaceProxyMiddleware } from './workspaceProxy.js';

const WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE =
  'prairielearn:workspace-authorization-expired';

const CONTAINER_PATH_REGEX = /^\/pl\/workspace\/([0-9]+)\/container\/(.*)/;

function getWorkspaceSandboxResponseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `frame-ancestors ${getTrustedPrairieLearnOrigin()};`,
    // The RStudio workspace proxy uses referrers to preserve HTTPS when rewriting redirects.
    // https://docs.posit.co/ide/server-pro/admin/access_and_security/running_with_a_proxy.html
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendAuthorizationExpired(res: Response, status = 401) {
  const message = JSON.stringify({ type: WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE });
  const targetOrigin = JSON.stringify(getTrustedPrairieLearnOrigin());
  res.status(status).type('html').send(`<!doctype html>
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

function getWorkspaceSession(res: Response): WorkspaceSandboxSession {
  return res.locals.workspaceSandboxSession;
}

function setWorkspaceAuthorizationCookie(res: Response, workspaceId: string) {
  res.cookie(WORKSPACE_SANDBOX_COOKIE_NAME, generateWorkspaceSandboxCookie({ workspaceId }), {
    httpOnly: true,
    maxAge: getWorkspaceSandboxCookieMaxAgeMilliseconds(),
    partitioned: true,
    path: '/',
    sameSite: 'none',
    secure: true,
  });
}

function setWorkspaceSessionCookie(
  res: Response,
  session: Pick<
    WorkspaceSandboxSession,
    'authorization_cookies' | 'public_question_endpoint' | 'session_id' | 'workspace_id'
  >,
) {
  res.cookie(
    WORKSPACE_SANDBOX_SESSION_COOKIE_NAME,
    generateWorkspaceSandboxSessionCookie({
      authorizationCookies: session.authorization_cookies,
      publicQuestionEndpoint: session.public_question_endpoint,
      sessionId: session.session_id,
      workspaceId: session.workspace_id,
    }),
    {
      httpOnly: true,
      maxAge: getWorkspaceSandboxSessionCookieMaxAgeMilliseconds(),
      partitioned: true,
      path: '/',
      sameSite: 'none',
      secure: true,
    },
  );
}

function checkWorkspaceAuthorizationCookie(req: Request, res: Response, next: NextFunction) {
  const access = validateWorkspaceSandboxAccess(req, req.params.workspace_id);
  if (!access.authorized && access.reason !== 'unauthorized') {
    res.status(404).send('Not Found');
    return;
  }

  if (access.authorized) return next('router');

  next();
}

export function makeWorkspaceSandboxMiddleware({
  onProxyRequest,
}: {
  onProxyRequest?: (req: Request) => void;
} = {}) {
  const router = Router();
  const responseHeaders = getWorkspaceSandboxResponseHeaders();
  const sessionStore = new PostgresSessionStore();
  const privateWorkspaceAuthorization = authzWorkspace({ publicQuestionEndpoint: false });
  const publicWorkspaceAuthorization = authzWorkspace({ publicQuestionEndpoint: true });

  // The short-lived authorization cookie keeps normal proxy requests off the database. After it
  // expires, the longer-lived sandbox session cookie lets us reauthorize and renew it without
  // reloading the workspace iframe.
  const workspaceAuthorizationRouter = Router({ mergeParams: true });
  workspaceAuthorizationRouter.use(checkWorkspaceAuthorizationCookie);
  workspaceAuthorizationRouter.use(
    asyncHandler(async (req, res, next) => {
      const sandboxSession = getWorkspaceSandboxSession(req, req.params.workspace_id);
      if (sandboxSession == null) {
        sendAuthorizationExpired(res);
        return;
      }

      const session = await loadExistingSession(
        sandboxSession.session_id,
        req,
        sessionStore,
        config.sessionStoreExpireSeconds * 1000,
      );
      if (session == null) {
        sendAuthorizationExpired(res);
        return;
      }

      if (extendSessionExpirationIfNeeded(session)) {
        await sessionStore.set(session.id, session, session.getExpirationDate());
      }

      req.session = session;
      Object.assign(req.cookies, sandboxSession.authorization_cookies);
      res.locals.workspaceSandboxSession = sandboxSession;
      next();
    }),
  );
  workspaceAuthorizationRouter.use(date, authn);
  workspaceAuthorizationRouter.use((req, res, next) => {
    const authorization = getWorkspaceSession(res).public_question_endpoint
      ? publicWorkspaceAuthorization
      : privateWorkspaceAuthorization;
    authorization(req, res, next);
  });
  workspaceAuthorizationRouter.use(
    asyncHandler(async (_req, res, next) => {
      if (!(await isWorkspaceIsolationEnabled(res.locals))) {
        sendAuthorizationExpired(res);
        return;
      }

      const sandboxSession = getWorkspaceSession(res);
      setWorkspaceSessionCookie(res, sandboxSession);
      setWorkspaceAuthorizationCookie(res, sandboxSession.workspace_id);
      next();
    }),
  );

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
  router.use(cookieParser());

  router.post(
    '/bootstrap',
    bodyParser.urlencoded({ extended: false, limit: '1kb' }),
    asyncHandler(async (req, res) => {
      const workspaceHost = getWorkspaceHost(res);
      const jwt = req.body?.jwt;
      if (typeof jwt !== 'string') {
        sendAuthorizationExpired(res, 403);
        return;
      }

      const payload = await verifyWorkspaceSandboxBootstrapJwt(jwt);
      if (payload == null || !idsEqual(payload.workspace_id, workspaceHost.workspaceId)) {
        sendAuthorizationExpired(res, 403);
        return;
      }

      setWorkspaceSessionCookie(res, {
        authorization_cookies: payload.authorization_cookies,
        public_question_endpoint: payload.public_question_endpoint,
        session_id: payload.session_id,
        workspace_id: payload.workspace_id,
      });
      setWorkspaceAuthorizationCookie(res, payload.workspace_id);
      res.redirect(303, `/pl/workspace/${payload.workspace_id}/container/`);
    }),
  );

  router.use(
    '/pl/workspace/:workspace_id(\\d+)/container',
    workspaceAuthorizationRouter,
    (req, _res, next) => {
      onProxyRequest?.(req);
      next();
    },
    makeWorkspaceProxyMiddleware(CONTAINER_PATH_REGEX, {
      authorizeWebSocketRequest: (req, workspaceId) =>
        validateWorkspaceSandboxWebSocketAccess(req, workspaceId).authorized,
      cookieDomainRewrite: '',
      rewriteContainerCookiesForCrossOrigin: true,
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

    if (res.headersSent) {
      next(err);
      return;
    }

    if (
      err != null &&
      typeof err === 'object' &&
      'status' in err &&
      typeof err.status === 'number' &&
      err.status >= 400 &&
      err.status < 500
    ) {
      sendAuthorizationExpired(res);
      return;
    }

    Sentry.captureException(err);
    res.status(500).send('Workspace request failed');
  }) satisfies ErrorRequestHandler);

  return router;
}
