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
import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import * as Sentry from '@prairielearn/sentry';
import { loadExistingSession } from '@prairielearn/session';
import { parseRequestBody } from '@prairielearn/zod';

import { config, setLocalsFromConfig } from '../lib/config.js';
import { PostgresSessionStore } from '../lib/session-store.js';
import { extendSessionExpirationIfNeeded } from '../lib/session.js';
import {
  WORKSPACE_SANDBOX_COOKIE_NAME,
  WORKSPACE_SANDBOX_SESSION_COOKIE_NAME,
  type WorkspaceSandboxHost,
  type WorkspaceSandboxSession,
  areWorkspaceSpecificHostsEnabled,
  classifyWorkspaceSandboxRequestHost,
  generateWorkspaceSandboxCookie,
  generateWorkspaceSandboxSessionCookie,
  getTrustedPrairieLearnOrigin,
  getWorkspaceSandboxCookieMaxAgeMilliseconds,
  getWorkspaceSandboxSession,
  getWorkspaceSandboxSessionCookieMaxAgeMilliseconds,
  redeemWorkspaceSandboxBootstrapToken,
  validateWorkspaceSandboxAccess,
  validateWorkspaceSandboxWebSocketAccess,
} from '../lib/workspace-sandbox.js';

import authn from './authn.js';
import authzWorkspace from './authzWorkspace.js';
import date from './date.js';
import { makeWorkspaceProxyMiddleware } from './workspaceProxy.js';

const WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE =
  'prairielearn:workspace-authorization-expired';

const CONTAINER_PATH_REGEX = /^\/pl\/workspace\/([0-9]+)\/container\/(.*)/;

const BootstrapBodySchema = z.object({ token: z.string().min(1).max(256) });

function getWorkspaceSandboxResponseHeaders(): Record<string, string> {
  return {
    // Until browsers ship the Public Suffix List entry for the sandbox domain, all workspace
    // hosts are the same site. Origin-keyed agent clusters stop one workspace from relaxing
    // `document.domain` to script another and let the browser isolate each workspace in its
    // own process. Chrome already defaults to this; Firefox and Safari need the header.
    'Origin-Agent-Cluster': '?1',
    // The RStudio workspace proxy uses referrers to preserve HTTPS when rewriting redirects.
    // https://docs.posit.co/ide/server-pro/admin/access_and_security/running_with_a_proxy.html
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

// Matches the page the load balancer serves for workspace-host paths that never reach
// PrairieLearn, so a workspace host looks the same whichever one answers.
function renderWorkspaceUnavailablePage({
  heading,
  message,
  script,
}: {
  heading: string;
  message: string;
  script?: string;
}) {
  const prairieLearnOrigin = getTrustedPrairieLearnOrigin();
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${heading}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f3f4f6;
            color: #1f2937;
            font:
              16px/1.5 system-ui,
              -apple-system,
              'Segoe UI',
              Roboto,
              sans-serif;
          }
          main {
            box-sizing: border-box;
            max-width: 28rem;
            margin: 1rem;
            padding: 2rem;
            background: #fff;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
          }
          h1 {
            margin: 0 0 0.5rem;
            font-size: 1.5rem;
          }
          a {
            color: #1d4ed8;
          }
          footer {
            margin-top: 1.5rem;
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>${heading}</h1>
          <p>${message}</p>
          <p><a href="${prairieLearnOrigin}">Go to PrairieLearn</a></p>
          <footer><a href="https://www.prairielearn.com/abuse">Report abuse</a></footer>
        </main>
        ${script ? unsafeHtml(`<script>${script}</script>`) : ''}
      </body>
    </html>
  `.toString();
}

function sendWorkspaceNotFound(res: Response) {
  res
    .status(404)
    .type('html')
    .send(
      renderWorkspaceUnavailablePage({
        heading: 'Workspace unavailable',
        message:
          'Open this workspace from PrairieLearn to continue. Workspace links only work from within your PrairieLearn session.',
      }),
    );
}

function sendAuthorizationExpired(res: Response, status = 401) {
  const message = JSON.stringify({ type: WORKSPACE_SANDBOX_AUTHORIZATION_EXPIRED_MESSAGE });
  const targetOrigin = JSON.stringify(getTrustedPrairieLearnOrigin());
  res
    .status(status)
    .type('html')
    .send(
      renderWorkspaceUnavailablePage({
        heading: 'Workspace connection expired',
        message: 'Your files remain saved. Return to PrairieLearn to reconnect.',
        script: `window.parent.postMessage(${message}, ${targetOrigin});`,
      }),
    );
}

function isClientError(err: unknown): err is { status: number } {
  return (
    err != null &&
    typeof err === 'object' &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
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
  const access =
    req.headers.upgrade?.toLowerCase() === 'websocket'
      ? validateWorkspaceSandboxWebSocketAccess(req, req.params.workspace_id)
      : validateWorkspaceSandboxAccess(req, req.params.workspace_id);
  if (!access.authorized && access.reason !== 'unauthorized') {
    res.sendStatus(access.reason === 'invalid-origin' ? 403 : 404);
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
  const workspaceSessionAuthorizationRouter = Router({ mergeParams: true });
  workspaceSessionAuthorizationRouter.use(
    asyncHandler(async (req, res, next) => {
      setLocalsFromConfig(res.locals);
      res.locals.workspace_id = req.params.workspace_id;

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
      // Only the trusted page's snapshot may influence reauthorization, not cookies set by an IDE.
      req.cookies = { ...sandboxSession.authorization_cookies };
      res.locals.workspaceSandboxSession = sandboxSession;
      next();
    }),
  );
  const authorizationChecks = Router({ mergeParams: true });
  authorizationChecks.use(date, authn);
  authorizationChecks.use((req, res, next) => {
    const authorization = getWorkspaceSession(res).public_question_endpoint
      ? publicWorkspaceAuthorization
      : privateWorkspaceAuthorization;
    authorization(req, res, next);
  });
  workspaceSessionAuthorizationRouter.use((req, res, next) => {
    // Express deprecates one redirect overload; we wrap the method without calling that overload.
    /* oxlint-disable typescript/no-deprecated */
    const originalSend = res.send;
    const originalRedirect = res.redirect.bind(res);
    const restoreResponse = () => {
      res.send = originalSend;
      res.redirect = originalRedirect;
    };
    // These middlewares either call next() on success or respond with a main-site login,
    // password, or denial page. Those pages cannot be served from the workspace host.
    // Limit interception to this chain so container responses and redirects are unaffected.
    const sendFailure = () => {
      const status = res.statusCode === 403 ? 403 : 401;
      restoreResponse();
      res.removeHeader('HX-Redirect');
      sendAuthorizationExpired(res, status);
      return res;
    };
    res.send = sendFailure;
    res.redirect = () => {
      sendFailure();
    };
    /* oxlint-enable typescript/no-deprecated */
    authorizationChecks(req, res, (err) => {
      restoreResponse();
      if (isClientError(err) && (err.status === 401 || err.status === 403)) {
        sendAuthorizationExpired(res, err.status);
        return;
      }
      next(err);
    });
  });
  workspaceSessionAuthorizationRouter.use(
    asyncHandler(async (_req, res, next) => {
      if (!(await areWorkspaceSpecificHostsEnabled(res.locals))) {
        sendAuthorizationExpired(res);
        return;
      }

      next();
    }),
  );

  const workspaceAuthorizationRouter = Router({ mergeParams: true });
  workspaceAuthorizationRouter.use(checkWorkspaceAuthorizationCookie);
  workspaceAuthorizationRouter.use(workspaceSessionAuthorizationRouter);
  workspaceAuthorizationRouter.use((_req, res, next) => {
    const sandboxSession = getWorkspaceSession(res);
    setWorkspaceSessionCookie(res, sandboxSession);
    setWorkspaceAuthorizationCookie(res, sandboxSession.workspace_id);
    next();
  });

  router.use((req, res, next) => {
    const workspaceHost = classifyWorkspaceSandboxRequestHost(req);
    if (workspaceHost.type === 'not-sandbox') return next('router');

    res.set({
      ...responseHeaders,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `frame-ancestors 'self' ${getTrustedPrairieLearnOrigin()};`,
    });
    if (workspaceHost.type === 'invalid-sandbox-host') {
      sendWorkspaceNotFound(res);
      return;
    }

    res.locals.workspaceSandboxHost = workspaceHost;
    next();
  });
  router.use(cookieParser());

  router.post(
    '/bootstrap',
    (req, res, next) => {
      if (req.headers.origin !== getTrustedPrairieLearnOrigin()) {
        res.sendStatus(403);
        return;
      }
      next();
    },
    bodyParser.urlencoded({ extended: false, limit: '8kb' }),
    asyncHandler(async (req, res) => {
      const workspaceHost = getWorkspaceHost(res);
      const { token } = parseRequestBody(req, BootstrapBodySchema);
      const payload = await redeemWorkspaceSandboxBootstrapToken(token, workspaceHost.workspaceId);
      if (payload == null) {
        sendAuthorizationExpired(res);
        return;
      }

      setWorkspaceSessionCookie(res, {
        authorization_cookies: payload.authorization_cookies,
        public_question_endpoint: payload.public_question_endpoint,
        session_id: payload.session_id,
        workspace_id: payload.workspace_id,
      });
      setWorkspaceAuthorizationCookie(res, payload.workspace_id);
      // Loading a document here makes the next navigation originate from the workspace host.
      // An HTTP redirect retains the cross-site request chain and would require an exception
      // that unrelated cross-site navigations could also use.
      res.type('html').send(
        html`
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Opening workspace</title>
            </head>
            <body>
              <script>
                window.location.replace('/pl/workspace/${payload.workspace_id}/container/');
              </script>
            </body>
          </html>
        `.toString(),
      );
    }),
  );

  router.use(
    '/pl/workspace/:workspace_id(\\d+)/container',
    workspaceAuthorizationRouter,
    (req, res, next) => {
      onProxyRequest?.(req);
      // Container assets retain their own cache policy; PL-generated responses remain no-store.
      res.removeHeader('Cache-Control');
      next();
    },
    makeWorkspaceProxyMiddleware(CONTAINER_PATH_REGEX, {
      cookieDomainRewrite: '',
      rewriteContainerCookiesForCrossOrigin: true,
      // Keep container service workers scoped below /container/, away from /bootstrap.
      removeResponseHeaders: ['X-Frame-Options', 'Service-Worker-Allowed'],
      responseHeaders,
      appendResponseHeaders: {
        // IDEs can nest same-workspace frames beneath the trusted PrairieLearn page.
        'Content-Security-Policy': `frame-ancestors 'self' ${getTrustedPrairieLearnOrigin()};`,
        Vary: 'Origin, Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest',
      },
    }),
  );

  router.use((_req, res) => {
    sendWorkspaceNotFound(res);
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

    res.set('Cache-Control', 'no-store');
    if (isClientError(err)) {
      if (err.status === 401) {
        sendAuthorizationExpired(res);
      } else {
        res.sendStatus(err.status);
      }
      return;
    }

    Sentry.captureException(err);
    res.status(500).send('Workspace request failed');
  }) satisfies ErrorRequestHandler);

  return router;
}
