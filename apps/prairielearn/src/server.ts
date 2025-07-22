/* eslint-disable import-x/order */
// IMPORTANT: this must come first so that it can properly instrument our
// dependencies like `pg` and `express`.
import * as opentelemetry from '@prairielearn/opentelemetry';
import * as Sentry from '@prairielearn/sentry';
/* eslint-enable import-x/order */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as util from 'node:util';
import * as url from 'url';

import blocked from 'blocked';
import blockedAt from 'blocked-at';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import esMain from 'es-main';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from 'express';
import asyncHandler from 'express-async-handler';
import minimist from 'minimist';
import multer from 'multer';
import onFinished from 'on-finished';
import passport from 'passport';
import favicon from 'serve-favicon';
import { v4 as uuidv4 } from 'uuid';

import { cache } from '@prairielearn/cache';
import { flashMiddleware } from '@prairielearn/flash';
import { addFileLogging, logger } from '@prairielearn/logger';
import * as migrations from '@prairielearn/migrations';
import {
  SCHEMA_MIGRATIONS_PATH,
  initBatchedMigrations,
  startBatchedMigrations,
  stopBatchedMigrations,
} from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import * as nodeMetrics from '@prairielearn/node-metrics';
import * as sqldb from '@prairielearn/postgres';
import { createSessionMiddleware } from '@prairielearn/session';

import * as cron from './cron/index.js';
import * as assets from './lib/assets.js';
import { makeAwsClientConfig } from './lib/aws.js';
import { canonicalLoggerMiddleware } from './lib/canonical-logger.js';
import * as codeCaller from './lib/code-caller/index.js';
import { config, loadConfig, setLocalsFromConfig } from './lib/config.js';
import { pullAndUpdateCourse } from './lib/course.js';
import * as externalGrader from './lib/externalGrader.js';
import * as externalGraderResults from './lib/externalGraderResults.js';
import * as externalGradingSocket from './lib/externalGradingSocket.js';
import * as externalImageCaptureSocket from './lib/externalImageCaptureSocket.js';
import { features } from './lib/features/index.js';
import { featuresMiddleware } from './lib/features/middleware.js';
import { isEnterprise } from './lib/license.js';
import * as lifecycleHooks from './lib/lifecycle-hooks.js';
import * as load from './lib/load.js';
import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from './lib/paths.js';
import * as serverJobs from './lib/server-jobs.js';
import { PostgresSessionStore } from './lib/session-store.js';
import * as socketServer from './lib/socket-server.js';
import { SocketActivityMetrics } from './lib/telemetry/socket-activity-metrics.js';
import { getSearchParams } from './lib/url.js';
import * as workspace from './lib/workspace.js';
import { markAllWorkspaceHostsUnhealthy } from './lib/workspaceHost.js';
import { enterpriseOnly } from './middlewares/enterpriseOnly.js';
import staticNodeModules from './middlewares/staticNodeModules.js';
import { makeWorkspaceProxyMiddleware } from './middlewares/workspaceProxy.js';
import * as news_items from './news_items/index.js';
import * as freeformServer from './question-servers/freeform.js';
import * as sprocs from './sprocs/index.js';

process.on('warning', (e) => console.warn(e));

const argv = minimist(process.argv.slice(2));

if ('h' in argv || 'help' in argv) {
  const msg = `PrairieLearn command line options:
    -h, --help                          Display this help and exit
    --config <filename>                 Use the specified configuration file
    --migrate-and-exit                  Run the DB initialization parts and exit
    --refresh-workspace-hosts-and-exit  Refresh the workspace hosts and exit
    --sync-course <course_id>           Synchronize a course and exit
`;

  console.log(msg);
  process.exit(0);
}

function excludeRoutes(routes: string[], handler: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (routes.some((route) => req.path.startsWith(route))) {
      next();
    } else {
      handler(req, res, next);
    }
  };
}

/**
 * Creates the express application and sets up all PrairieLearn routes.
 * @return The express "app" object that was created.
 */
export async function initExpress(): Promise<Express> {
  const app = express();
  app.set('views', path.join(import.meta.dirname, 'pages'));
  app.set('trust proxy', config.trustProxy);

  // These should come first so that we get instrumentation on all our requests.
  if (config.sentryDsn) {
    app.use(Sentry.requestHandler());

    app.use((await import('./lib/sentry.js')).enrichSentryEventMiddleware);
  }

  // This should come before the session middleware so that we don't
  // create a session every time we get a health check request.
  app.get('/pl/webhooks/ping', function (req, res) {
    res.send('.');
  });

  // Set res.locals variables first, so they will be available on
  // all pages including the error page (which we could jump to at
  // any point.
  app.use((req, res, next) => {
    setLocalsFromConfig(res.locals);
    next();
  });

  const sessionMiddleware = createSessionMiddleware({
    secret: config.secretKey,
    store: new PostgresSessionStore(),
    cookie: {
      name: 'pl2_session',
      writeNames: ['prairielearn_session', 'pl2_session'],
      // Ensure that the legacy session cookie doesn't have a domain specified.
      // We can only safely set domains on the new session cookie.
      writeOverrides: [{ domain: undefined }, { domain: config.cookieDomain ?? undefined }],
      httpOnly: true,
      maxAge: config.sessionStoreExpireSeconds * 1000,
      secure: 'auto', // uses Express "trust proxy" setting
      sameSite: config.sessionCookieSameSite,
    },
  });

  const sessionRouter = Router();
  sessionRouter.use(sessionMiddleware);
  sessionRouter.use(flashMiddleware());
  sessionRouter.use((req, res, next) => {
    // This middleware helps ensure that sessions remain alive (un-expired) as
    // long as users are somewhat frequently active. See the documentation for
    // `config.sessionStoreAutoExtendThrottleSeconds` for more information.
    //
    // Compute the number of milliseconds until the session expires.
    const sessionTtl = req.session.getExpirationDate().getTime() - Date.now();

    if (
      sessionTtl <
      (config.sessionStoreExpireSeconds - config.sessionStoreAutoExtendThrottleSeconds) * 1000
    ) {
      req.session.setExpiration(config.sessionStoreExpireSeconds * 1000);
    }

    next();
  });

  // API routes don't utilize sessions; don't run the session/flash middleware for them.
  app.use(excludeRoutes(['/pl/api/'], sessionRouter));

  // special parsing of file upload paths -- this is inelegant having it
  // separate from the route handlers but it seems to be necessary
  // Special handling of file-upload routes so that we can parse multipart/form-data
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fieldSize: config.fileUploadMaxBytes,
      fileSize: config.fileUploadMaxBytes,
      parts: config.fileUploadMaxParts,
    },
  });
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/uploads',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment_instance/:assessment_instance_id(\\d+)',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)',
    upload.single('file'),
  );
  app.post('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)', upload.single('file'));
  app.post(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file_view/*',
    upload.single('file'),
  );

  app.post(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    upload.single('file'),
  );

  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/settings',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/settings',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/settings',
    upload.single('file'),
  );
  app.post('/pl/course/:course_id(\\d+)/course_admin/settings', upload.single('file'));
  app.post('/pl/course/:course_id(\\d+)/course_admin/file_view', upload.single('file'));
  app.post('/pl/course/:course_id(\\d+)/course_admin/file_view/*', upload.single('file'));
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/groups',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    upload.single('file'),
  );
  app.post(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    upload.single('file'),
  );

  // Collect metrics on workspace proxy sockets. Note that this only tracks
  // outgoing sockets (those going to workspaces). Incoming sockets are tracked
  // globally for the entire server.
  const meter = opentelemetry.metrics.getMeter('prairielearn');
  const workspaceProxySocketActivityMetrics = new SocketActivityMetrics(meter, 'workspace-proxy');
  workspaceProxySocketActivityMetrics.start();

  const workspaceAuthRouter = Router();
  workspaceAuthRouter.use([
    // We use a short-lived cookie to cache a successful
    // authn/authz for a specific workspace. We run the following
    // middlewares in this separate sub-router so that we can
    // short-circuit out of authzWorkspaceCookieCheck if we find
    // the workspace-authz cookie. Short-circuiting will exit this
    // sub-router immediately, so we can either exit this
    // sub-router by finding the cookie, or by running regular
    // authn/authz.

    (await import('./middlewares/authzWorkspaceCookieCheck.js')).default, // short-circuits if we have the workspace-authz cookie
    (await import('./middlewares/date.js')).default,
    (await import('./middlewares/authn.js')).default, // jumps to error handler if authn fails
    (await import('./middlewares/authzWorkspace.js')).default, // jumps to error handler if authz fails
    (await import('./middlewares/authzWorkspaceCookieSet.js')).default, // sets the workspace-authz cookie
  ]);
  app.use('/pl/workspace/:workspace_id(\\d+)/container', [
    cookieParser(),
    (req: Request, res: Response, next: NextFunction) => {
      // Needed for workspaceAuthRouter.
      res.locals.workspace_id = req.params.workspace_id;
      next();
    },
    workspaceAuthRouter,
    (req: Request, res: Response, next: NextFunction) => {
      workspaceProxySocketActivityMetrics.addSocket(req.socket);
      next();
    },
    makeWorkspaceProxyMiddleware(),
  ]);

  app.use((req, res, next) => {
    // Stripe webhook signature verification requires the raw body, so we avoid
    // using the body parser for that route.
    if (req.path === '/pl/webhooks/stripe') return next();

    // Limit to 5MB of JSON
    bodyParser.json({ limit: 5 * 1024 * 1024 })(req, res, next);
  });
  app.use(bodyParser.urlencoded({ extended: false, limit: 5 * 1536 * 1024 }));
  app.use(cookieParser());
  app.use(passport.initialize());
  if (config.devMode) app.use(favicon(path.join(APP_ROOT_PATH, 'public', 'favicon-dev.ico')));
  else app.use(favicon(path.join(APP_ROOT_PATH, 'public', 'favicon.ico')));

  assets.applyMiddleware(app);

  // This route is kept around for legacy reasons - new code should prefer the
  // assets system with cacheable assets.
  app.use(express.static(path.join(APP_ROOT_PATH, 'public')));

  // For backwards compatibility, we redirect requests for the old `node_modules`
  // route to the new `cacheable_node_modules` route.
  app.use('/node_modules', (req, res) => {
    // Strip the leading slash.
    const assetPath = req.url.slice(1);
    res.redirect(assets.nodeModulesAssetPath(assetPath));
  });

  // Support legacy use of ace by v2 questions
  app.use(
    '/localscripts/calculationQuestion/ace',
    staticNodeModules(path.join('ace-builds', 'src-min-noconflict')),
  );
  app.use('/javascripts/ace', staticNodeModules(path.join('ace-builds', 'src-min-noconflict')));

  // Middleware for all requests
  // response_id is logged on request, response, and error to link them together
  app.use(function (req, res, next) {
    res.locals.response_id = uuidv4();
    res.set('X-Response-ID', res.locals.response_id);
    next();
  });

  // load accounting for requests
  app.use(function (req, res, next) {
    load.startJob('request', res.locals.response_id);
    next();
  });
  app.use(function (req, res, next) {
    onFinished(res, function (err, res) {
      if (err) {
        logger.verbose('request on-response-finished error', {
          err,
          response_id: res.locals.response_id,
        });
      }
      load.endJob('request', res.locals.response_id);
    });
    next();
  });

  // This makes a `CanonicalLogger` instance available throughout this request
  // via AsyncLocalStorage.
  app.use(canonicalLoggerMiddleware());

  // More middlewares
  app.use((await import('./middlewares/logResponse.js')).default); // defers to end of response
  app.use((await import('./middlewares/cors.js')).default);
  app.use((await import('./middlewares/content-security-policy.js')).default);
  app.use((await import('./middlewares/date.js')).default);
  app.use((await import('./middlewares/effectiveRequestChanged.js')).default);

  app.use('/pl/oauth2login', (await import('./pages/authLoginOAuth2/authLoginOAuth2.js')).default);
  app.use(
    '/pl/oauth2callback',
    (await import('./pages/authCallbackOAuth2/authCallbackOAuth2.js')).default,
  );
  app.use(
    /\/pl\/shibcallback/,
    (await import('./pages/authCallbackShib/authCallbackShib.js')).default,
  );

  if (isEnterprise()) {
    if (config.hasAzure) {
      app.use('/pl/azure_login', (await import('./ee/auth/azure/login.js')).default);
      app.use('/pl/azure_callback', (await import('./ee/auth/azure/callback.js')).default);
    }

    app.use('/pl/lti13_instance', (await import('./ee/routers/lti13.js')).default);
    app.use(
      '/pl/auth/institution/:institution_id(\\d+)/saml',
      (await import('./ee/auth/saml/router.js')).default,
    );
  }

  app.use('/pl/lti', (await import('./pages/authCallbackLti/authCallbackLti.js')).default);
  app.use('/pl/login', (await import('./pages/authLogin/authLogin.js')).default);
  if (config.devMode) {
    app.use('/pl/dev_login', (await import('./pages/authLoginDev/authLoginDev.js')).default);
  }
  app.use('/pl/logout', [
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navPage = 'logout';
      next();
    },
    (await import('./pages/authLogout/authLogout.js')).default,
  ]);
  app.use((await import('./middlewares/authn.js')).default); // authentication, set res.locals.authn_user
  app.use('/pl/api/v1', (await import('./middlewares/authnToken.js')).default); // authn for the API, set res.locals.authn_user

  // Must come after the authentication middleware, as we need to read the
  // `authn_is_administrator` property from the response locals.
  //
  // This means that feature flag overrides will not be available for
  // unauthenticated routes.
  app.use(featuresMiddleware((req, res) => res.locals.authn_is_administrator));

  if (isEnterprise()) {
    app.use('/pl/prairietest/auth', (await import('./ee/auth/prairietest.js')).default);
  }

  // Must come before CSRF middleware; we do our own signature verification here.
  app.use('/pl/webhooks/terminate', (await import('./webhooks/terminate.js')).default);
  app.use(
    '/pl/webhooks/stripe',
    await enterpriseOnly(async () => (await import('./ee/webhooks/stripe/index.js')).default),
  );

  // Set and check `res.locals.__csrf_token`. We exclude API routes as those
  // don't require CSRF protection (and in fact can't have it at all).
  app.use(excludeRoutes(['/pl/api/'], (await import('./middlewares/csrfToken.js')).default));

  app.use((await import('./middlewares/logRequest.js')).default);

  // load accounting for authenticated accesses
  app.use(function (req, res, next) {
    load.startJob('authed_request', res.locals.response_id);
    next();
  });
  app.use(function (req, res, next) {
    onFinished(res, function (err, res) {
      if (err) {
        logger.verbose('authed_request on-response-finished error', {
          err,
          response_id: res.locals.response_id,
        });
      }
      load.endJob('authed_request', res.locals.response_id);
    });
    next();
  });

  // clear cookies on the homepage to reset any stale session state
  app.use(/^(\/?)$|^(\/pl\/?)$/, (await import('./middlewares/clearCookies.js')).default);

  // some pages don't need authorization
  app.use('/', (await import('./pages/home/home.js')).default);
  app.use('/pl', (await import('./pages/home/home.js')).default);
  app.use('/pl/settings', (await import('./pages/userSettings/userSettings.js')).default);
  app.use('/pl/enroll', (await import('./pages/enroll/enroll.js')).default);
  app.use('/pl/password', (await import('./pages/authPassword/authPassword.js')).default);
  app.use('/pl/news_items', (await import('./pages/newsItems/newsItems.js')).default);
  app.use('/pl/news_item', (await import('./pages/newsItem/newsItem.js')).default);
  app.use('/pl/request_course', [
    // Users can post data to this page and then view it, so we'll block access to prevent
    // students from using to infiltrate or exfiltrate exam information.
    (await import('./middlewares/forbidAccessInExamMode.js')).default,
    (await import('./pages/instructorRequestCourse/instructorRequestCourse.js')).default,
  ]);

  if (isEnterprise()) {
    app.use('/pl/terms', (await import('./ee/pages/terms/terms.js')).default);
  }

  // We deliberately omit the `authzCourseOrInstance` middleware here. The
  // route handler will only ever display courses for which the user has staff
  // access; the course ID in the URL is only used to determine which course
  // is the currently selected one.
  app.use(
    '/pl/navbar/course/:course_id(\\d+)/switcher',
    (await import('./pages/navbarCourseSwitcher/navbarCourseSwitcher.js')).default,
  );
  app.use(
    '/pl/navbar/course/:course_id(\\d+)/course_instance_switcher/:course_instance_id(\\d+)?',
    [
      (await import('./middlewares/authzCourseOrInstance.js')).default,
      (await import('./pages/navbarCourseInstanceSwitcher/navbarCourseInstanceSwitcher.js'))
        .default,
    ],
  );
  app.use(
    '/pl/navbar/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)/switcher',
    [
      (await import('./middlewares/authzCourseOrInstance.js')).default,
      (await import('./pages/assessmentsSwitcher/assessmentsSwitcher.js')).default,
    ],
  );

  // Handles updates to the side nav expanded state.
  app.use(
    '/pl/side_nav/settings',
    (await import('./pages/sideNavSettings/sideNavSettings.js')).default,
  );

  app.use('/pl/workspace/:workspace_id(\\d+)', [
    (req: Request, res: Response, next: NextFunction) => {
      res.locals.workspace_id = req.params.workspace_id;
      next();
    },
    (await import('./middlewares/authzWorkspace.js')).default,
  ]);
  app.use(
    '/pl/workspace/:workspace_id(\\d+)',
    (await import('./pages/workspace/workspace.js')).default,
  );
  app.use(
    '/pl/workspace/:workspace_id(\\d+)/logs',
    (await import('./pages/workspaceLogs/workspaceLogs.js')).default,
  );

  // dev-mode pages are mounted for both out-of-course access (here) and within-course access (see below)
  if (config.devMode) {
    app.use(
      '/pl/loadFromDisk',
      (await import('./pages/instructorLoadFromDisk/instructorLoadFromDisk.js')).default,
    );
    app.use('/pl/jobSequence', (await import('./pages/jobSequence/jobSequence.js')).default);
  }

  // Redirect plain course instance page either to student or instructor assessments page
  app.use(/^(\/pl\/course_instance\/[0-9]+)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/assessments`);
  });
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/instance_admin/assessments`);
  });

  // is the course instance being accessed through the student or instructor page route
  app.use('/pl/course_instance/:course_instance_id(\\d+)', function (req, res, next) {
    res.locals.viewType = 'student';
    next();
  });
  app.use('/pl/course_instance/:course_instance_id(\\d+)/instructor', function (req, res, next) {
    res.locals.viewType = 'instructor';
    next();
  });

  // sets res.locals.course and res.locals.course_instance
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)',
    (await import('./middlewares/authzCourseOrInstance.js')).default,
  );

  // This must come after `authzCourseOrInstance` but before the `checkPlanGrants`
  // or `autoEnroll` middlewares so that we can render it even when the student
  // isn't enrolled in the course instance or doesn't have the necessary plan grants.
  if (isEnterprise()) {
    // This must come before `authzHasCourseInstanceAccess` and the upgrade page
    // below so that we can render it even when the student isn't enrolled in the
    // course instance.
    app.use('/pl/course_instance/:course_instance_id(\\d+)/upgrade', [
      (await import('./ee/pages/studentCourseInstanceUpgrade/studentCourseInstanceUpgrade.js'))
        .default,
    ]);
  }

  // all pages under /pl/course_instance require authorization
  app.use('/pl/course_instance/:course_instance_id(\\d+)', [
    await enterpriseOnly(async () => (await import('./ee/middlewares/checkPlanGrants.js')).default),
    (await import('./middlewares/autoEnroll.js')).default,
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id;
      next();
    },
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navbarType = 'student';
      next();
    },
  ]);

  // Some course instance student pages only require course instance authorization (already checked)
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/news_items',
    (await import('./pages/newsItems/newsItems.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/news_item',
    (await import('./pages/newsItem/newsItem.js')).default,
  );

  // Some course instance student pages only require the authn user to have permissions
  app.use('/pl/course_instance/:course_instance_id(\\d+)/effectiveUser', [
    (await import('./middlewares/authzAuthnHasCoursePreviewOrInstanceView.js')).default,
    (await import('./pages/instructorEffectiveUser/instructorEffectiveUser.js')).default,
  ]);

  // All course instance instructor pages require the authn user to have permissions
  app.use('/pl/course_instance/:course_instance_id(\\d+)/instructor', [
    (await import('./middlewares/forbidAccessInExamMode.js')).default,
    (await import('./middlewares/authzAuthnHasCoursePreviewOrInstanceView.js')).default,
    (await import('./middlewares/selectOpenIssueCount.js')).default,
    (await import('./middlewares/selectGettingStartedTasksCounts.js')).default,
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navbarType = 'instructor';
      next();
    },
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id + '/instructor';
      next();
    },
  ]);

  // Some course instance instructor pages only require the authn user to have permissions (already checked)
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/effectiveUser',
    (await import('./pages/instructorEffectiveUser/instructorEffectiveUser.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/news_items',
    (await import('./pages/newsItems/newsItems.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/news_item',
    (await import('./pages/newsItem/newsItem.js')).default,
  );

  // All other course instance student pages require the effective user to have permissions
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)',
    (await import('./middlewares/authzHasCourseInstanceAccess.js')).default,
  );

  // All other course instance instructor pages require the effective user to have permissions
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor',
    (await import('./middlewares/authzHasCoursePreviewOrInstanceView.js')).default,
  );

  // all pages under /pl/course require authorization
  app.use('/pl/course/:course_id(\\d+)', [
    (await import('./middlewares/forbidAccessInExamMode.js')).default,
    (await import('./middlewares/authzCourseOrInstance.js')).default, // set res.locals.course
    (await import('./middlewares/selectOpenIssueCount.js')).default,
    (await import('./middlewares/selectGettingStartedTasksCounts.js')).default,
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navbarType = 'instructor';
      next();
    },
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.urlPrefix = '/pl/course/' + req.params.course_id;
      next();
    },
  ]);

  // Serve element statics. As with core PrairieLearn assets and files served
  // from `node_modules`, we include a cachebuster in the URL. This allows
  // files to be treated as immutable in production and cached aggressively.
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/sharedElements/course/:producing_course_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/sharedElements/course/:producing_course_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course/:course_id(\\d+)/sharedElements/course/:producing_course_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course/:course_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/cacheableElementExtensions/:cachebuster',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/cacheableElementExtensions/:cachebuster',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/cacheableElementExtensions/:cachebuster',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );

  // For backwards compatibility, we continue to serve the non-cached element
  // files.
  // TODO: if we can determine that these routes are no longer receiving
  // traffic in the future, we can delete these.
  //
  // TODO: the only internal usage of this is in the `pl-drawing` element. Fix that.
  app.use(
    '/pl/static/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default({
      publicQuestionEndpoint: false,
      coreElements: true,
    }),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course/:course_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/sharedElements/course/:producing_course_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/sharedElements/course/:producing_course_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course/:course_id(\\d+)/sharedElements/course/:producing_course_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default(),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/elementExtensions',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/elementExtensions',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/elementExtensions',
    (await import('./pages/elementExtensionFiles/elementExtensionFiles.js')).default,
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // API ///////////////////////////////////////////////////////////////

  app.use('/pl/api/trpc', (await import('./api/trpc/index.js')).default);
  app.use('/pl/api/v1', (await import('./api/v1/index.js')).default);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Instructor pages //////////////////////////////////////////////////

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor',
    asyncHandler(async (req, res, next) => {
      res.locals.lti11_enabled =
        config.hasLti && (await features.enabledFromLocals('lti11', res.locals));
      next();
    }),
  );

  // single assessment
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)',
    [
      (await import('./middlewares/selectAndAuthzAssessment.js')).default,
      (await import('./middlewares/selectAssessments.js')).default,
    ],
  );
  app.use(
    /^(\/pl\/course_instance\/[0-9]+\/instructor\/assessment\/[0-9]+)\/?$/,
    (req, res, _next) => {
      res.redirect(`${req.params[0]}/questions`);
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)',
    function (req, res, next) {
      res.locals.navPage = 'assessment';
      next();
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/settings',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'settings';
        next();
      },
      (await import('./pages/instructorAssessmentSettings/instructorAssessmentSettings.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/questions',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'questions';
        next();
      },
      (await import('./pages/instructorAssessmentQuestions/instructorAssessmentQuestions.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/groups',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'groups';
        next();
      },
      (await import('./pages/instructorAssessmentGroups/instructorAssessmentGroups.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/access',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'access';
        next();
      },
      (await import('./pages/instructorAssessmentAccess/instructorAssessmentAccess.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/assessment_statistics',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'assessment_statistics';
        next();
      },
      (await import('./pages/instructorAssessmentStatistics/instructorAssessmentStatistics.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/question_statistics',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'question_statistics';
        next();
      },
      (
        await import(
          './pages/instructorAssessmentQuestionStatistics/instructorAssessmentQuestionStatistics.js'
        )
      ).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/downloads',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'downloads';
        next();
      },
      (await import('./pages/instructorAssessmentDownloads/instructorAssessmentDownloads.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/uploads',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'uploads';
        next();
      },
      (await import('./pages/instructorAssessmentUploads/instructorAssessmentUploads.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/regrading',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'regrading';
        next();
      },
      (await import('./pages/instructorAssessmentRegrading/instructorAssessmentRegrading.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/instances',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'instances';
        next();
      },
      (await import('./pages/instructorAssessmentInstances/instructorAssessmentInstances.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/manual_grading/assessment_question/:assessment_question_id(\\d+)',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      (await import('./middlewares/selectAndAuthzAssessmentQuestion.js')).default,
      (
        await import(
          './pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.js'
        )
      ).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/manual_grading/instance_question/:instance_question_id(\\d+)',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (
        await import(
          './pages/instructorAssessmentManualGrading/instanceQuestion/instanceQuestion.js'
        )
      ).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/clientFilesQuestion',
    [
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (await import('./pages/clientFilesQuestion/clientFilesQuestion.js')).default(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/generatedFilesQuestion',
    [
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (await import('./pages/generatedFilesQuestion/generatedFilesQuestion.js')).default(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/file',
    [
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/text',
    [
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
    ],
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_question/:instance_question_id(\\d+)/submission/:unsafe_submission_id(\\d+)/file',
    [
      (await import('./middlewares/selectAndAuthzInstanceQuestion.js')).default,
      (await import('./pages/submissionFile/submissionFile.js')).default(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/manual_grading',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      (await import('./pages/instructorAssessmentManualGrading/assessment/assessment.js')).default,
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment_instance/:assessment_instance_id(\\d+)',
    [
      (await import('./middlewares/selectAndAuthzAssessmentInstance.js')).default,
      (await import('./middlewares/selectAssessments.js')).default,
      (await import('./pages/instructorAssessmentInstance/instructorAssessmentInstance.js'))
        .default,
    ],
  );

  // single question
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)',
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./middlewares/authzHasCoursePreview.js')).default,
  );
  app.use(
    /^(\/pl\/course_instance\/[0-9]+\/instructor\/question\/[0-9]+)\/?$/,
    (req, res, _next) => {
      // Redirect legacy question URLs to their preview page.
      // We need to maintain query parameters like `variant_id` so that the
      // preview page can render the correct variant.
      res.redirect(
        url.format({
          pathname: `${req.params[0]}/preview`,
          search: getSearchParams(req).toString(),
        }),
      );
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)',
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navPage = 'question';
      next();
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/settings',
    (await import('./pages/instructorQuestionSettings/instructorQuestionSettings.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/preview',
    (await import('./pages/instructorQuestionPreview/instructorQuestionPreview.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/statistics',
    [
      function (req: Request, res: Response, next: NextFunction) {
        res.locals.navSubPage = 'statistics';
        next();
      },
      (await import('./pages/instructorQuestionStatistics/instructorQuestionStatistics.js'))
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    (await import('./pages/externalImageCapture/externalImageCapture.js')).default(),
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/grading_job',
    (await import('./pages/instructorGradingJob/instructorGradingJob.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/jobSequence',
    (await import('./pages/jobSequence/jobSequence.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/loadFromDisk',
    (await import('./pages/instructorLoadFromDisk/instructorLoadFromDisk.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/edit_error',
    (await import('./pages/editError/editError.js')).default,
  );

  // course instance - course admin pages
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/course_admin)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/instances`);
  });
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin',
    function (req, res, next) {
      res.locals.navPage = 'course_admin';
      next();
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/settings',
    (await import('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings.js'))
      .default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/sharing',
    (await import('./pages/instructorCourseAdminSharing/instructorCourseAdminSharing.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/staff',
    (await import('./pages/instructorCourseAdminStaff/instructorCourseAdminStaff.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/sets',
    (await import('./pages/instructorCourseAdminSets/instructorCourseAdminSets.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/modules',
    (await import('./pages/instructorCourseAdminModules/instructorCourseAdminModules.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/instances',
    (await import('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances.js'))
      .default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/issues',
    (await import('./pages/instructorIssues/instructorIssues.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/questions',
    (await import('./pages/instructorQuestions/instructorQuestions.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/getting_started',
    (
      await import(
        './pages/instructorCourseAdminGettingStarted/instructorCourseAdminGettingStarted.js'
      )
    ).default,
  );
  if (isEnterprise()) {
    app.use(
      '/pl/course_instance/:course_instance_id(\\d+)/instructor/ai_generate_editor/:question_id(\\d+)',
      (
        await import(
          './ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.js'
        )
      ).default,
    );
    app.use(
      '/pl/course_instance/:course_instance_id(\\d+)/instructor/ai_generate_question_drafts',
      (await import('./ee/pages/instructorAiGenerateDrafts/instructorAiGenerateDrafts.js')).default,
    );
  }
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/syncs',
    (await import('./pages/courseSyncs/courseSyncs.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/topics',
    (await import('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/tags',
    (await import('./pages/instructorCourseAdminTags/instructorCourseAdminTags.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/course_admin/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );

  // course instance - instance admin pages
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/instance_admin)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/assessments`);
  });
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin',
    function (req, res, next) {
      res.locals.navPage = 'instance_admin';
      next();
    },
    asyncHandler(async (req, res, next) => {
      // The navigation tabs rely on these values to know when to show/hide themselves
      // so we need to load it for all instance admin pages.
      const hasCourseInstanceBilling = await features.enabledFromLocals(
        'course-instance-billing',
        res.locals,
      );
      res.locals.billing_enabled = hasCourseInstanceBilling && isEnterprise();
      next();
    }),
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/settings',
    (await import('./pages/instructorInstanceAdminSettings/instructorInstanceAdminSettings.js'))
      .default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/access',
    (await import('./pages/instructorInstanceAdminAccess/instructorInstanceAdminAccess.js'))
      .default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/assessments',
    (await import('./pages/instructorAssessments/instructorAssessments.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/gradebook',
    (await import('./pages/instructorGradebook/instructorGradebook.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/lti',
    (await import('./pages/instructorInstanceAdminLti/instructorInstanceAdminLti.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );
  if (isEnterprise()) {
    app.use(
      '/pl/course_instance/:course_instance_id(\\d+)/instructor/instance_admin/billing',
      (await import('./ee/pages/instructorInstanceAdminBilling/instructorInstanceAdminBilling.js'))
        .default,
    );
    app.use(
      '/pl/course_instance/:course_instance_id/instructor/instance_admin/lti13_instance',
      (await import('./ee/pages/instructorInstanceAdminLti13/instructorInstanceAdminLti13.js'))
        .default,
    );
  }

  // Global client files
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/clientFilesCourseInstance',
    (await import('./pages/clientFilesCourseInstance/clientFilesCourseInstance.js')).default,
  );

  // Client files for assessments
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/clientFilesCourseInstance',
    (await import('./pages/clientFilesCourseInstance/clientFilesCourseInstance.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/assessment/:assessment_id(\\d+)/clientFilesAssessment',
    [
      (await import('./middlewares/selectAndAuthzAssessment.js')).default,
      (await import('./pages/clientFilesAssessment/clientFilesAssessment.js')).default,
    ],
  );

  // Client files for questions
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/clientFilesQuestion',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/clientFilesQuestion/clientFilesQuestion.js')).default(),
    ],
  );

  // generatedFiles
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/generatedFilesQuestion',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/generatedFilesQuestion/generatedFilesQuestion.js')).default(),
    ],
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/submission/:unsafe_submission_id(\\d+)/file',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/submissionFile/submissionFile.js')).default(),
    ],
  );

  // legacy client file paths
  // handle routes with and without /preview/ in them to handle URLs with and without trailing slashes
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/file',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/preview/file',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/text',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instructor/question/:question_id(\\d+)/preview/text',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
    ],
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Student pages /////////////////////////////////////////////////////

  app.use('/pl/course_instance/:course_instance_id(\\d+)/gradebook', [
    (await import('./pages/studentGradebook/studentGradebook.js')).default,
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessments',
    (await import('./pages/studentAssessments/studentAssessments.js')).default,
  );

  // Client files for assessments - These routes must come before the
  // assessment route (.../assessment/:assessment_id) to avoid hitting the
  // middleware on that route first. The middleware on that route will redirect
  // to the student assessment instance if an instance exists and will prevent
  // reaching the client file route.
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)/clientFilesCourse',
    [
      (await import('./middlewares/selectAndAuthzAssessment.js')).default,
      (await import('./middlewares/studentAssessmentAccess.js')).default,
      (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)/clientFilesCourseInstance',
    [
      (await import('./middlewares/selectAndAuthzAssessment.js')).default,
      (await import('./middlewares/studentAssessmentAccess.js')).default,
      (await import('./pages/clientFilesCourseInstance/clientFilesCourseInstance.js')).default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)/clientFilesAssessment',
    [
      (await import('./middlewares/selectAndAuthzAssessment.js')).default,
      (await import('./middlewares/studentAssessmentAccess.js')).default,
      (await import('./pages/clientFilesAssessment/clientFilesAssessment.js')).default,
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)',
    (await import('./pages/studentAssessment/studentAssessment.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment_instance/:assessment_instance_id(\\d+)/file',
    (await import('./pages/studentAssessmentInstanceFile/studentAssessmentInstanceFile.js'))
      .default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment_instance/:assessment_instance_id(\\d+)/time_remaining',
    (
      await import(
        './pages/studentAssessmentInstanceTimeRemaining/studentAssessmentInstanceTimeRemaining.js'
      )
    ).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/assessment_instance/:assessment_instance_id(\\d+)',
    (await import('./pages/studentAssessmentInstance/studentAssessmentInstance.js')).default,
  );

  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)',
    (await import('./pages/studentInstanceQuestion/studentInstanceQuestion.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    (await import('./pages/externalImageCapture/externalImageCapture.js')).default(),
  );

  if (config.devMode) {
    app.use(
      '/pl/course_instance/:course_instance_id(\\d+)/loadFromDisk',
      (await import('./pages/instructorLoadFromDisk/instructorLoadFromDisk.js')).default,
    );
    app.use(
      '/pl/course_instance/:course_instance_id(\\d+)/jobSequence',
      (await import('./pages/jobSequence/jobSequence.js')).default,
    );
  }

  // Global client files
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/clientFilesCourseInstance',
    (await import('./pages/clientFilesCourseInstance/clientFilesCourseInstance.js')).default,
  );

  // Client files for questions
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/clientFilesQuestion',
    (await import('./pages/clientFilesQuestion/clientFilesQuestion.js')).default(),
  );

  // generatedFiles
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/generatedFilesQuestion',
    (await import('./pages/generatedFilesQuestion/generatedFilesQuestion.js')).default(),
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/submission/:unsafe_submission_id(\\d+)/file',
    (await import('./pages/submissionFile/submissionFile.js')).default(),
  );

  // legacy client file paths
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/file',
    (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id(\\d+)/instance_question/:instance_question_id(\\d+)/text',
    (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Course pages //////////////////////////////////////////////////////

  app.use(/^\/pl\/course\/[0-9]+\/?$/, function (req, res, _next) {
    res.redirect(res.locals.urlPrefix + '/course_admin');
  }); // redirect plain course URL to overview page

  // Some course pages only require the authn user to have permission (already checked)
  app.use(
    '/pl/course/:course_id(\\d+)/effectiveUser',
    (await import('./pages/instructorEffectiveUser/instructorEffectiveUser.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/news_items',
    (await import('./pages/newsItems/newsItems.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/news_item',
    (await import('./pages/newsItem/newsItem.js')).default,
  );

  // All other course pages require the effective user to have permission
  app.use(
    '/pl/course/:course_id(\\d+)',
    (await import('./middlewares/authzHasCoursePreview.js')).default,
  );

  // single question

  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)',
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
  );
  app.use(/^(\/pl\/course\/[0-9]+\/question\/[0-9]+)\/?$/, (req, res, _next) => {
    // Redirect legacy question URLs to their preview page.
    // We need to maintain query parameters like `variant_id` so that the
    // preview page can render the correct variant.
    res.redirect(
      url.format({
        pathname: `${req.params[0]}/preview`,
        search: getSearchParams(req).toString(),
      }),
    );
  });
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)', function (req, res, next) {
    res.locals.navPage = 'question';
    next();
  });

  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    (await import('./pages/externalImageCapture/externalImageCapture.js')).default(),
  );

  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/settings',
    (await import('./pages/instructorQuestionSettings/instructorQuestionSettings.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/preview',
    (await import('./pages/instructorQuestionPreview/instructorQuestionPreview.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/statistics',
    (await import('./pages/instructorQuestionStatistics/instructorQuestionStatistics.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );

  app.use('/pl/course/:course_id(\\d+)/file_transfer', [
    (await import('./pages/instructorFileTransfer/instructorFileTransfer.js')).default,
  ]);

  app.use(
    '/pl/course/:course_id(\\d+)/edit_error',
    (await import('./pages/editError/editError.js')).default,
  );

  app.use(
    '/pl/course/:course_id(\\d+)/course_admin',
    (await import('./pages/instructorCourseAdmin/instructorCourseAdmin.js')).default,
  );
  app.use('/pl/course/:course_id(\\d+)/course_admin', function (req, res, next) {
    res.locals.navPage = 'course_admin';
    next();
  });
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/settings',
    (await import('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings.js'))
      .default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/sharing',
    (await import('./pages/instructorCourseAdminSharing/instructorCourseAdminSharing.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/staff',
    (await import('./pages/instructorCourseAdminStaff/instructorCourseAdminStaff.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/sets',
    (await import('./pages/instructorCourseAdminSets/instructorCourseAdminSets.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/modules',
    (await import('./pages/instructorCourseAdminModules/instructorCourseAdminModules.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/instances',
    (await import('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances.js'))
      .default,
  );
  app.use('/pl/course/:course_id(\\d+)/course_admin/getting_started', [
    (
      await import(
        './pages/instructorCourseAdminGettingStarted/instructorCourseAdminGettingStarted.js'
      )
    ).default,
  ]);
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/issues',
    (await import('./pages/instructorIssues/instructorIssues.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/questions',
    (await import('./pages/instructorQuestions/instructorQuestions.js')).default,
  );
  if (isEnterprise()) {
    app.use(
      '/pl/course/:course_id(\\d+)/ai_generate_editor/:question_id(\\d+)',
      (
        await import(
          './ee/pages/instructorAiGenerateDraftEditor/instructorAiGenerateDraftEditor.js'
        )
      ).default,
    );
    app.use(
      '/pl/course/:course_id(\\d+)/ai_generate_question_drafts',
      (await import('./ee/pages/instructorAiGenerateDrafts/instructorAiGenerateDrafts.js')).default,
    );
  }
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/syncs',
    (await import('./pages/courseSyncs/courseSyncs.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/topics',
    (await import('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/tags',
    (await import('./pages/instructorCourseAdminTags/instructorCourseAdminTags.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/file_edit',
    (await import('./pages/instructorFileEditor/instructorFileEditor.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/file_view',
    (await import('./pages/instructorFileBrowser/instructorFileBrowser.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/course_admin/file_download',
    (await import('./pages/instructorFileDownload/instructorFileDownload.js')).default,
  );

  app.use(
    '/pl/course/:course_id(\\d+)/loadFromDisk',
    (await import('./pages/instructorLoadFromDisk/instructorLoadFromDisk.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/jobSequence',
    (await import('./pages/jobSequence/jobSequence.js')).default,
  );
  app.use(
    '/pl/course/:course_id(\\d+)/grading_job',
    (await import('./pages/instructorGradingJob/instructorGradingJob.js')).default,
  );

  // This route is used to initiate a copy of a question with publicly shared source
  // or a question from a template course.
  // It is not actually a page; it's just used to initiate the transfer. The reason
  // that this is a route on the target course and not handled by the source question
  // pages is that the source question pages are served by chunk servers, but the
  // question transfer machinery relies on access to course repositories on disk,
  // which don't exist on chunk servers
  app.use(
    '/pl/course/:course_id(\\d+)/copy_public_question',
    (await import('./pages/instructorCopyPublicQuestion/instructorCopyPublicQuestion.js')).default,
  );
  // Also not a page, like above. This route is used to initiate the transfer of a public course instance
  app.use(
    '/pl/course/:course_id(\\d+)/copy_public_course_instance',
    (
      await import(
        './pages/instructorCopyPublicCourseInstance/instructorCopyPublicCourseInstance.js'
      )
    ).default,
  );

  // Global client files
  app.use(
    '/pl/course/:course_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );

  // Client files for questions
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/clientFilesCourse',
    (await import('./pages/clientFilesCourse/clientFilesCourse.js')).default,
  );
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/clientFilesQuestion', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/clientFilesQuestion/clientFilesQuestion.js')).default(),
  ]);

  // generatedFiles
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/generatedFilesQuestion', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/generatedFilesQuestion/generatedFilesQuestion.js')).default(),
  ]);

  // Submission files
  app.use(
    '/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/submission/:unsafe_submission_id(\\d+)/file',
    [
      (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
      (await import('./pages/submissionFile/submissionFile.js')).default(),
    ],
  );

  // legacy client file paths
  // handle routes with and without /preview/ in them to handle URLs with and without trailing slashes
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/file', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
  ]);
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/preview/file', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/legacyQuestionFile/legacyQuestionFile.js')).default,
  ]);
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/text', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
  ]);
  app.use('/pl/course/:course_id(\\d+)/question/:question_id(\\d+)/preview/text', [
    (await import('./middlewares/selectAndAuthzInstructorQuestion.js')).default,
    (await import('./pages/legacyQuestionText/legacyQuestionText.js')).default,
  ]);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Public course pages ///////////////////////////////////////////////

  // Prevent access to public pages when in exam mode.
  app.use('/pl/public', (await import('./middlewares/forbidAccessInExamMode.js')).default);

  app.use('/pl/public/course/:course_id(\\d+)', [
    function (req: Request, res: Response, next: NextFunction) {
      res.locals.navbarType = 'public';
      res.locals.urlPrefix = '/pl/public/course/' + req.params.course_id;
      next();
    },
  ]);
  app.use('/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/file_view', [
    function (req, res, next) {
      res.locals.navPage = 'public_question';
      next();
    },
    (await import('./pages/publicQuestionFileBrowser/publicQuestionFileBrowser.js')).default,
  ]);
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/file_download',
    (await import('./pages/publicQuestionFileDownload/publicQuestionFileDownload.js')).default,
  );
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/preview',
    (await import('./pages/publicQuestionPreview/publicQuestionPreview.js')).default,
  );
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/externalImageCapture/variant/:variant_id(\\d+)',
    (await import('./pages/externalImageCapture/externalImageCapture.js')).default({
      publicQuestionPreview: true,
    }),
  );
  app.use(
    '/pl/public/course/:course_id(\\d+)/questions',
    (await import('./pages/publicQuestions/publicQuestions.js')).default,
  );
  app.use(
    '/pl/public/course/:course_id(\\d+)/cacheableElements/:cachebuster',
    (await import('./pages/elementFiles/elementFiles.js')).default({
      publicQuestionEndpoint: true,
      coreElements: false,
    }),
  );
  app.use(
    '/pl/public/course/:course_id(\\d+)/elements',
    (await import('./pages/elementFiles/elementFiles.js')).default({
      publicQuestionEndpoint: true,
      coreElements: false,
    }),
  );
  app.use(
    '/pl/public/course_instance/:course_instance_id(\\d+)/assessments',
    (await import('./pages/publicAssessments/publicAssessments.js')).default,
  );
  app.use(/^(\/pl\/public\/course_instance\/[0-9]+\/assessment\/[0-9]+)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/questions`);
  });
  app.use(
    '/pl/public/course_instance/:course_instance_id(\\d+)/assessment/:assessment_id(\\d+)/questions',
    (await import('./pages/publicAssessmentQuestions/publicAssessmentQuestions.js')).default,
  );

  // Client files for questions
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/clientFilesQuestion',
    (await import('./pages/clientFilesQuestion/clientFilesQuestion.js')).default({
      publicEndpoint: true,
    }),
  );

  // generatedFiles
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/generatedFilesQuestion',
    (await import('./pages/generatedFilesQuestion/generatedFilesQuestion.js')).default({
      publicEndpoint: true,
    }),
  );

  // Submission files
  app.use(
    '/pl/public/course/:course_id(\\d+)/question/:question_id(\\d+)/submission/:unsafe_submission_id(\\d+)/file',
    [(await import('./pages/submissionFile/submissionFile.js')).default({ publicEndpoint: true })],
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Institution administrator pages ///////////////////////////////////
  if (isEnterprise()) {
    app.use(
      '/pl/institution/:institution_id(\\d+)/admin',
      (await import('./ee/routers/institutionAdmin.js')).default,
    );
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Administrator pages ///////////////////////////////////////////////

  app.use('/pl/administrator', (await import('./middlewares/authzIsAdministrator.js')).default);

  app.use(
    '/pl/administrator',
    asyncHandler(async (req, res, next) => {
      const hasEnhancedNavigation = await features.enabled('enhanced-navigation', {
        user_id: res.locals.authn_user.user_id,
      });
      res.locals.has_enhanced_navigation = hasEnhancedNavigation;
      next();
    }),
  );

  app.use(
    '/pl/administrator/admins',
    (await import('./pages/administratorAdmins/administratorAdmins.js')).default,
  );
  app.use(
    '/pl/administrator/settings',
    (await import('./pages/administratorSettings/administratorSettings.js')).default,
  );
  app.use(
    '/pl/administrator/institutions',
    (await import('./pages/administratorInstitutions/administratorInstitutions.js')).default,
  );
  app.use(
    '/pl/administrator/courses',
    (await import('./pages/administratorCourses/administratorCourses.js')).default,
  );
  app.use(
    '/pl/administrator/networks',
    (await import('./pages/administratorNetworks/administratorNetworks.js')).default,
  );
  app.use(
    '/pl/administrator/workspaces',
    (await import('./pages/administratorWorkspaces/administratorWorkspaces.js')).default,
  );
  app.use(
    '/pl/administrator/features',
    (await import('./pages/administratorFeatures/administratorFeatures.js')).default,
  );
  app.use(
    '/pl/administrator/queries',
    (await import('./pages/administratorQueries/administratorQueries.js')).default,
  );
  app.use(
    '/pl/administrator/query',
    (await import('./pages/administratorQuery/administratorQuery.js')).default,
  );
  app.use(
    '/pl/administrator/jobSequence',
    (await import('./pages/jobSequence/jobSequence.js')).default,
  );
  app.use(
    '/pl/administrator/courseRequests',
    (await import('./pages/administratorCourseRequests/administratorCourseRequests.js')).default,
  );
  app.use(
    '/pl/administrator/batchedMigrations',
    (await import('./pages/administratorBatchedMigrations/administratorBatchedMigrations.js'))
      .default,
  );

  if (isEnterprise()) {
    app.use(
      '/pl/administrator/institution/:institution_id(\\d+)',
      (await import('./ee/routers/administratorInstitution.js')).default,
    );
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Error handling ////////////////////////////////////////////////////

  // if no earlier routes matched, this will match and generate a 404 error
  app.use((await import('./middlewares/notFound.js')).default);

  app.use((await import('./middlewares/redirectEffectiveAccessDenied.js')).default);

  // This is not a true error handler; it just implements support for
  // "throwing" redirects.
  app.use((await import('./lib/redirect.js')).thrownRedirectMiddleware);

  /**
   * Attempts to extract a numeric status code from a Postgres error object.
   * The convention we use is to use a `ERRCODE` value of `ST###`, where ###
   * is the three-digit HTTP status code.
   *
   * For example, the following exception would set a 404 status code:
   *
   * RAISE EXCEPTION 'Entity not found' USING ERRCODE = 'ST404';
   *
   * @returns The extracted HTTP status code
   */
  function maybeGetStatusCodeFromSqlError(err: any): number | null {
    const rawCode = err?.data?.sqlError?.code;
    if (!rawCode?.startsWith('ST')) return null;

    const parsedCode = Number(rawCode.toString().substring(2));
    if (Number.isNaN(parsedCode)) return null;

    return parsedCode;
  }

  // This should come first so that both Sentry and our own error page can
  // read the error ID and any status code.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    res.locals.error_id = Array.from({ length: 12 })
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');

    err.status = err.status ?? maybeGetStatusCodeFromSqlError(err) ?? 500;

    next(err);
  });

  // The Sentry error handler must come before our own.
  app.use(Sentry.expressErrorHandler());

  app.use((await import('./pages/error/error.js')).default);

  return app;
}

//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
// Server startup ////////////////////////////////////////////////////

let server: http.Server | https.Server;

export async function startServer() {
  const app = await initExpress();

  if (config.serverType === 'https') {
    const options: https.ServerOptions = {};
    if (config.sslKeyFile) {
      options.key = await fs.promises.readFile(config.sslKeyFile);
    }
    if (config.sslCertificateFile) {
      options.cert = await fs.promises.readFile(config.sslCertificateFile);
    }
    if (config.sslCAFile) {
      options.ca = [await fs.promises.readFile(config.sslCAFile)];
    }
    server = https.createServer(options, app);
    logger.verbose('server listening to HTTPS on port ' + config.serverPort);
  } else if (config.serverType === 'http') {
    server = http.createServer(app);
    logger.verbose('server listening to HTTP on port ' + config.serverPort);
  } else {
    throw new Error('unknown serverType: ' + config.serverType);
  }

  // Capture metrics about the server, including the number of active connections
  // and the total number of connections that have been started.
  const meter = opentelemetry.metrics.getMeter('prairielearn');

  const connectionCounter = opentelemetry.getCounter(meter, 'http.connections', {
    valueType: opentelemetry.ValueType.INT,
  });
  server.on('connection', () => connectionCounter.add(1));

  // Hack to get us running in Bun, which doesn't currently support `getConnections`:
  // https://github.com/oven-sh/bun/issues/4459
  if (server.getConnections) {
    opentelemetry.createObservableValueGauges(
      meter,
      'http.connections.active',
      {
        valueType: opentelemetry.ValueType.INT,
        interval: 1000,
      },
      () => {
        return util.promisify(server.getConnections.bind(server))();
      },
    );
  }

  const serverSocketActivity = new SocketActivityMetrics(meter, 'http');
  server.on('connection', (socket) => serverSocketActivity.addSocket(socket));
  serverSocketActivity.start();

  server.timeout = config.serverTimeout;
  server.keepAliveTimeout = config.serverKeepAliveTimeout;
  server.listen(config.serverPort);

  // Wait for the server to either start successfully or error out.
  await new Promise((resolve, reject) => {
    let done = false;

    server.on('error', (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });

    server.on('listening', () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });
  });

  return server;
}

export async function stopServer() {
  if (!server) throw new Error('cannot stop an undefined server');
  if (!server.listening) return;

  // This exists mostly for tests, where we might have dangling connections
  // from `fetch()` requests whose bodies we never read. `server.close()` won't
  // actually stop the server until all connections are closed, so we need to
  // manually close said connections.
  //
  // In production environments, PrairieLearn should always be deployed behind
  // a load balancer that will drain and close any open connections before
  // PrairieLearn is stopped.
  server.closeAllConnections();

  await util.promisify(server.close.bind(server))();
}

export async function insertDevUser() {
  // add dev user as Administrator
  const sql =
    'INSERT INTO users (uid, name)' +
    " VALUES ('dev@example.com', 'Dev User')" +
    ' ON CONFLICT (uid) DO UPDATE' +
    ' SET name = EXCLUDED.name' +
    ' RETURNING user_id;';
  const result = await sqldb.queryOneRowAsync(sql, []);
  const user_id = result.rows[0].user_id;
  const adminSql =
    'INSERT INTO administrators (user_id)' +
    ' VALUES ($user_id)' +
    ' ON CONFLICT (user_id) DO NOTHING;';
  await sqldb.queryAsync(adminSql, { user_id });
}

function idleErrorHandler(err: Error) {
  logger.error('idle client error', err);
  Sentry.captureException(err, {
    level: 'fatal',
    tags: {
      // This may have been set by `@prairielearn/postgres`. We include this in the
      // Sentry tags to more easily debug idle client errors.
      last_query: (err as any)?.data?.lastQuery ?? undefined,
    },
  });
  Sentry.close().finally(() => process.exit(1));
}

if (esMain(import.meta) && config.startServer) {
  try {
    logger.verbose('PrairieLearn server start');

    // For backwards compatibility, we'll default to trying to load config
    // files from both the application and repository root.
    //
    // We'll put the app config file second so that it can override anything
    // in the repository root config file.
    let configPaths = [
      path.join(REPOSITORY_ROOT_PATH, 'config.json'),
      path.join(APP_ROOT_PATH, 'config.json'),
    ];

    // If a config file was specified on the command line, we'll use that
    // instead of the default locations.
    if ('config' in argv) {
      configPaths = [argv['config']];
    }

    // Load config immediately so we can use it configure everything else.
    await loadConfig(configPaths);

    // This should be done as soon as we load our config so that we can
    // start exporting spans.
    await opentelemetry.init({
      ...config,
      serviceName: 'prairielearn',
      // For Sentry to work correctly, it needs to hook into our OpenTelemetry setup.
      // https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/opentelemetry/
      //
      // However, despite what their documentation claims, only the `SentryContextManager`
      // is necessary if one isn't using Sentry for tracing. In fact, if `SentrySpanProcessor`
      // is used, 100% of traces will be sent to Sentry, despite us never having set
      // `tracesSampleRate` in the Sentry configuration.
      contextManager: config.sentryDsn ? new Sentry.SentryContextManager() : undefined,
    });

    // Same with Sentry configuration.
    if (config.sentryDsn) {
      await Sentry.init({
        dsn: config.sentryDsn,
        environment: config.sentryEnvironment,

        // We have our own OpenTelemetry setup, so ensure Sentry doesn't
        // try to set that up for itself, but only if OpenTelemetry is
        // enabled. Otherwise, allow Sentry to install its own stuff so
        // that request isolation works correctly.
        skipOpenTelemetrySetup: config.openTelemetryEnabled,
      });
    }

    // Start capturing profiling information as soon as possible.
    if (config.pyroscopeEnabled) {
      if (
        !config.pyroscopeServerAddress ||
        !config.pyroscopeBasicAuthUser ||
        !config.pyroscopeBasicAuthPassword
      ) {
        throw new Error('Pyroscope configuration is incomplete');
      }

      const Pyroscope = await import('@pyroscope/nodejs');
      Pyroscope.init({
        appName: 'prairielearn',
        serverAddress: config.pyroscopeServerAddress,
        basicAuthUser: config.pyroscopeBasicAuthUser,
        basicAuthPassword: config.pyroscopeBasicAuthPassword,
        tags: {
          instanceId: config.instanceId,
          ...config.pyroscopeTags,
        },
      });
      Pyroscope.start();
    }

    if (config.logFilename) {
      addFileLogging({ filename: config.logFilename });
    }

    if (config.logErrorFilename) {
      addFileLogging({ filename: config.logErrorFilename, level: 'error' });
    }

    if (config.blockedAtWarnEnable) {
      blockedAt(
        (time, stack) => {
          const msg = `BLOCKED-AT: Blocked for ${time}ms`;
          logger.verbose(msg, { time, stack });
          console.log(msg + '\n' + stack.join('\n'));
        },
        { threshold: config.blockedWarnThresholdMS },
      ); // threshold in milliseconds
    } else if (config.blockedWarnEnable) {
      blocked(
        (time) => {
          const msg = `BLOCKED: Blocked for ${time}ms (set config.blockedAtWarnEnable for stack trace)`;
          logger.verbose(msg, { time });
          console.log(msg);
        },
        { threshold: config.blockedWarnThresholdMS },
      ); // threshold in milliseconds
    }

    if (isEnterprise() && config.hasAzure) {
      const { getAzureStrategy } = await import('./ee/auth/azure/index.js');
      passport.use(getAzureStrategy());
    }

    if (isEnterprise()) {
      const { strategy } = await import('./ee/auth/saml/index.js');
      passport.use(strategy);
    }

    const pgConfig = {
      user: config.postgresqlUser,
      database: config.postgresqlDatabase,
      host: config.postgresqlHost,
      password: config.postgresqlPassword ?? undefined,
      max: config.postgresqlPoolSize,
      idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
      ssl: config.postgresqlSsl,
      errorOnUnusedParameters: config.devMode,
    };

    logger.verbose(`Connecting to ${pgConfig.user}@${pgConfig.host}:${pgConfig.database}`);

    await sqldb.initAsync(pgConfig, idleErrorHandler);

    // Our named locks code maintains a separate pool of database connections.
    // This ensures that we avoid deadlocks.
    await namedLocks.init(pgConfig, idleErrorHandler, {
      renewIntervalMs: config.namedLocksRenewIntervalMs,
    });

    logger.verbose('Successfully connected to database');

    if (argv['refresh-workspace-hosts-and-exit']) {
      logger.info('option --refresh-workspace-hosts specified, refreshing workspace hosts');

      const hosts = await markAllWorkspaceHostsUnhealthy('refresh-workspace-hosts-and-exit');

      const pluralHosts = hosts.length === 1 ? 'host' : 'hosts';
      logger.info(`${hosts.length} ${pluralHosts} marked unhealthy`);
      hosts.forEach((host) => logger.info(`- ${host.instance_id} (${host.hostname})`));

      process.exit(0);
    }

    // We need to do this before we run migrations, as some migrations will
    // call `enqueueBatchedMigration` which requires this to be initialized.
    const runner = initBatchedMigrations({
      project: 'prairielearn',
      directories: [path.join(import.meta.dirname, 'batched-migrations')],
    });

    runner.on('error', (err) => {
      logger.error('Batched migration runner error', err);
      Sentry.captureException(err);
    });

    // Using the `--migrate-and-exit` flag will override the value of
    // `config.runMigrations`. This allows us to use the same config when
    // running migrations as we do when we start the server.
    if (config.runMigrations || argv['migrate-and-exit']) {
      await migrations.init(
        [path.join(import.meta.dirname, 'migrations'), SCHEMA_MIGRATIONS_PATH],
        'prairielearn',
      );

      if (argv['migrate-and-exit']) {
        logger.info('option --migrate-and-exit passed, running DB setup and exiting');
        process.exit(0);
      }
    }

    // Collect metrics on our Postgres connection pools.
    const meter = opentelemetry.metrics.getMeter('prairielearn');

    const pools = [
      {
        name: 'default',
        pool: sqldb.defaultPool,
      },
      {
        name: 'named-locks',
        pool: namedLocks.pool,
      },
    ];

    pools.forEach(({ name, pool }) => {
      opentelemetry.createObservableValueGauges(
        meter,
        `postgres.pool.${name}.total`,
        { valueType: opentelemetry.ValueType.INT, interval: 1000 },
        () => pool.totalCount,
      );

      opentelemetry.createObservableValueGauges(
        meter,
        `postgres.pool.${name}.idle`,
        { valueType: opentelemetry.ValueType.INT, interval: 1000 },
        () => pool.idleCount,
      );

      opentelemetry.createObservableValueGauges(
        meter,
        `postgres.pool.${name}.waiting`,
        { valueType: opentelemetry.ValueType.INT, interval: 1000 },
        () => pool.waitingCount,
      );

      const queryCounter = opentelemetry.getObservableCounter(
        meter,
        `postgres.pool.${name}.query.count`,
        { valueType: opentelemetry.ValueType.INT },
      );
      queryCounter.addCallback((observableResult) => {
        observableResult.observe(pool.queryCount);
      });
    });

    // Collect metrics on our code callers.
    opentelemetry.createObservableValueGauges(
      meter,
      'code-caller.pool.size',
      { valueType: opentelemetry.ValueType.INT, interval: 1000 },
      () => codeCaller.getMetrics().size,
    );
    opentelemetry.createObservableValueGauges(
      meter,
      'code-caller.pool.available',
      { valueType: opentelemetry.ValueType.INT, interval: 1000 },
      () => codeCaller.getMetrics().available,
    );
    opentelemetry.createObservableValueGauges(
      meter,
      'code-caller.pool.borrowed',
      { valueType: opentelemetry.ValueType.INT, interval: 1000 },
      () => codeCaller.getMetrics().borrowed,
    );
    opentelemetry.createObservableValueGauges(
      meter,
      'code-caller.pool.pending',
      { valueType: opentelemetry.ValueType.INT, interval: 1000 },
      () => codeCaller.getMetrics().pending,
    );

    // We create and activate a random DB schema name
    // (https://www.postgresql.org/docs/current/ddl-schemas.html)
    // after we have run the migrations but before we create
    // the sprocs. This means all tables (from migrations) are
    // in the public schema, but all sprocs are in the random
    // schema. Every server invocation thus has its own copy
    // of its sprocs, allowing us to update servers while old
    // servers are still running. See docs/dev-guide.md for
    // more info.
    //
    // We use the combination of instance ID and port number to uniquely
    // identify each server; in some cases, we're running multiple instances
    // on the same physical host.
    //
    // The schema prefix should not exceed 28 characters; this is due to
    // the underlying Postgres limit of 63 characters for schema names.
    // Currently, EC2 instance IDs are 19 characters long, and we use
    // 4-digit port numbers, so this will be safe (19+1+4=24). If either
    // of those ever get longer, we have a little wiggle room. Nonetheless,
    // we'll check to make sure we don't exceed the limit and fail fast if
    // we do.
    const schemaPrefix = `${config.instanceId}:${config.serverPort}`;
    if (schemaPrefix.length > 28) {
      throw new Error(`Schema prefix is too long: ${schemaPrefix}`);
    }
    await sqldb.setRandomSearchSchemaAsync(schemaPrefix);
    await sprocs.init();

    if (config.runBatchedMigrations) {
      // Now that all migrations have been run, we can start executing any
      // batched migrations that may have been enqueued by migrations.
      //
      // Note that we don't do this until sprocs have been created because
      // some batched migrations may depend on sprocs.
      startBatchedMigrations({
        workDurationMs: config.batchedMigrationsWorkDurationMs,
        sleepDurationMs: config.batchedMigrationsSleepDurationMs,
      });
    }

    if ('sync-course' in argv) {
      logger.info(`option --sync-course passed, syncing course ${argv['sync-course']}...`);
      const { jobSequenceId, jobPromise } = await pullAndUpdateCourse({
        courseId: argv['sync-course'],
        authnUserId: null,
        userId: null,
      });
      logger.info(`Course sync job sequence ${jobSequenceId} created.`);
      logger.info('Waiting for job to finish...');
      await jobPromise;
      (await serverJobs.selectJobsByJobSequenceId(jobSequenceId)).forEach((job) => {
        logger.info(`Job ${job.id} finished with status '${job.status}'.\n${job.output}`);
      });
      process.exit(0);
    }

    if (config.initNewsItems) {
      // We initialize news items asynchronously so that servers can boot up
      // in production as quickly as possible.
      news_items.initInBackground({
        // Always notify in production environments.
        notifyIfPreviouslyEmpty: !config.devMode,
      });
    }

    // We need to initialize these first, as the code callers require these
    // to be set up.
    load.initEstimator('request', 1);
    load.initEstimator('authed_request', 1);
    load.initEstimator('python', 1, false);
    load.initEstimator('python_worker_active', 1);
    load.initEstimator('python_worker_idle', 1, false);
    load.initEstimator('python_callback_waiting', 1);

    await codeCaller.init();
    await assets.init();
    await cache.init({
      type: config.cacheType,
      keyPrefix: config.cacheKeyPrefix,
      redisUrl: config.redisUrl,
    });
    await freeformServer.init();

    if (config.devMode) {
      await insertDevUser();
    }

    logger.verbose('Starting server...');
    const server = await startServer();

    await socketServer.init(server);

    externalGradingSocket.init();
    externalGrader.init();
    externalImageCaptureSocket.init();

    await workspace.init();
    serverJobs.init();

    if (config.runningInEc2 && config.nodeMetricsIntervalSec) {
      nodeMetrics.start({
        awsConfig: makeAwsClientConfig(),
        intervalSeconds: config.nodeMetricsIntervalSec,
        namespace: 'PrairieLearn',
        dimensions: [
          { Name: 'Server Group', Value: config.groupName },
          { Name: 'InstanceId', Value: `${config.instanceId}:${config.serverPort}` },
        ],
        onError(err) {
          logger.error('Error reporting Node metrics', err);
          Sentry.captureException(err);
        },
      });
    }

    // These should be the last things to start before we actually start taking
    // requests, as they may actually end up executing course code.
    if (config.externalGradingEnableResults) {
      await externalGraderResults.init();
    }

    await cron.init();
    await lifecycleHooks.completeInstanceLaunch();
  } catch (err) {
    logger.error('Error initializing PrairieLearn server:', err);
    throw err;
  }
  logger.info('PrairieLearn server ready, press Control-C to quit');
  if (config.devMode) {
    logger.info('Go to ' + config.serverType + '://localhost:' + config.serverPort);
  }

  // SIGTERM can be used to gracefully shut down the process. This signal
  // may come from another process, but we also send it to ourselves if
  // we want to gracefully shut down. This is used below in the ASG
  // lifecycle handler, and also within the "terminate" webhook.
  process.once('SIGTERM', async () => {
    // By this point, we should no longer be attached to the load balancer,
    // so there's no point shutting down the HTTP server or the socket.io
    // server.
    //
    // We use `allSettled()` here to ensure that all tasks can gracefully
    // shut down, even if some of them fail.
    logger.info('Shutting down async processing');
    const results = await Promise.allSettled([
      externalGraderResults.stop(),
      cron.stop(),
      serverJobs.stop(),
      stopBatchedMigrations(),
    ]);
    results.forEach((r) => {
      if (r.status === 'rejected') {
        logger.error('Error shutting down async processing', r.reason);
        Sentry.captureException(r.reason);
      }
    });

    try {
      await lifecycleHooks.completeInstanceTermination();
    } catch (err) {
      logger.error('Error completing instance termination', err);
      Sentry.captureException(err);
    }

    logger.info('Terminating...');
    // Shut down OpenTelemetry exporting.
    try {
      await opentelemetry.shutdown();
    } catch (err) {
      logger.error('Error shutting down OpenTelemetry', err);
      Sentry.captureException(err);
    }

    // Flush all events to Sentry.
    try {
      await Sentry.flush();
    } finally {
      process.exit(0);
    }
  });
}
