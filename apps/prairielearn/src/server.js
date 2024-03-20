// IMPORTANT: this must come first so that it can properly instrument our
// dependencies like `pg` and `express`.
const opentelemetry = require('@prairielearn/opentelemetry');

const Sentry = require('@prairielearn/sentry');
// `@sentry/tracing` must be imported before `@sentry/profiling-node`.
require('@sentry/tracing');
const { ProfilingIntegration } = require('@sentry/profiling-node');

const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const util = require('util');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const favicon = require('serve-favicon');
const async = require('async');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const Bowser = require('bowser');
const http = require('http');
const https = require('https');
const blocked = require('blocked');
const blockedAt = require('blocked-at');
const onFinished = require('on-finished');
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser')(process.argv.slice(2));
const multer = require('multer');
const { filesize } = require('filesize');
const url = require('url');
const { createProxyMiddleware } = require('http-proxy-middleware');
const {
  SCHEMA_MIGRATIONS_PATH,
  initBatchedMigrations,
  startBatchedMigrations,
  stopBatchedMigrations,
} = require('@prairielearn/migrations');

const { logger, addFileLogging } = require('@prairielearn/logger');
const { config, loadConfig, setLocalsFromConfig } = require('./lib/config');
const load = require('./lib/load');
const externalGrader = require('./lib/externalGrader');
const externalGraderResults = require('./lib/externalGraderResults');
const externalGradingSocket = require('./lib/externalGradingSocket');
const workspace = require('./lib/workspace');
const sqldb = require('@prairielearn/postgres');
const migrations = require('@prairielearn/migrations');
const error = require('@prairielearn/error');
const sprocs = require('./sprocs');
const news_items = require('./news_items');
const cron = require('./cron');
const socketServer = require('./lib/socket-server');
const serverJobs = require('./lib/server-jobs-legacy');
const freeformServer = require('./question-servers/freeform.js');
const { cache } = require('@prairielearn/cache');
const { LocalCache } = require('./lib/local-cache');
const codeCaller = require('./lib/code-caller');
const assets = require('./lib/assets');
const namedLocks = require('@prairielearn/named-locks');
const { EncodedData } = require('@prairielearn/browser-utils');
const nodeMetrics = require('./lib/node-metrics');
const { isEnterprise } = require('./lib/license');
const lifecycleHooks = require('./lib/lifecycle-hooks');
const { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } = require('./lib/paths');
const staticNodeModules = require('./middlewares/staticNodeModules');
const { flashMiddleware, flash } = require('@prairielearn/flash');
const { features } = require('./lib/features');
const { featuresMiddleware } = require('./lib/features/middleware');
const { markAllWorkspaceHostsUnhealthy } = require('./lib/workspaceHost');
const { createSessionMiddleware } = require('@prairielearn/session');
const { PostgresSessionStore } = require('./lib/session-store');
const { pullAndUpdateCourse } = require('./lib/course');
const { selectJobsByJobSequenceId } = require('./lib/server-jobs');
const { SocketActivityMetrics } = require('./lib/telemetry/socket-activity-metrics');

process.on('warning', (e) => console.warn(e));

// If there is only one argument and `server.js` is being executed directly,
// legacy it into the config option.
if (require.main === module && argv['_'].length === 1) {
  argv['config'] = argv['_'][0];
  argv['_'] = [];
}

if ('h' in argv || 'help' in argv) {
  var msg = `PrairieLearn command line options:
    -h, --help                          Display this help and exit
    --config <filename>
    <filename> and no other args        Load an alternative config filename
    --migrate-and-exit                  Run the DB initialization parts and exit
    --refresh-workspace-hosts-and-exit  Refresh the workspace hosts and exit
    --sync-course <course_id>           Synchronize a course and exit
`;

  console.log(msg);
  process.exit(0);
}

function enterpriseOnlyMiddleware(load) {
  if (isEnterprise()) {
    return load();
  }
  return (req, res, next) => next();
}

/**
 * Creates the express application and sets up all PrairieLearn routes.
 * @return {import('express').Express} The express "app" object that was created.
 */
module.exports.initExpress = function () {
  const app = express();
  app.set('views', path.join(__dirname, 'pages'));
  app.set('view engine', 'ejs');
  app.set('trust proxy', config.trustProxy);

  // These should come first so that we get instrumentation on all our requests.
  if (config.sentryDsn) {
    app.use(Sentry.Handlers.requestHandler());

    if (config.sentryTracesSampleRate) {
      app.use(Sentry.Handlers.tracingHandler());
    }

    app.use(require('./lib/sentry').enrichSentryEventMiddleware);
  }

  // This should come before the session middleware so that we don't
  // create a session every time we get a health check request.
  app.get('/pl/webhooks/ping', function (req, res, _next) {
    res.send('.');
  });

  // Set res.locals variables first, so they will be available on
  // all pages including the error page (which we could jump to at
  // any point.
  app.use((req, res, next) => {
    res.locals.asset_path = assets.assetPath;
    res.locals.node_modules_asset_path = assets.nodeModulesAssetPath;
    res.locals.compiled_script_tag = assets.compiledScriptTag;
    res.locals.compiled_stylesheet_tag = assets.compiledStylesheetTag;
    res.locals.compiled_script_path = assets.compiledScriptPath;
    res.locals.compiled_stylesheet_path = assets.compiledStylesheetPath;
    res.locals.encoded_data = EncodedData;
    next();
  });
  app.use(function (req, res, next) {
    res.locals.config = config;
    next();
  });
  app.use(function (req, res, next) {
    setLocalsFromConfig(res.locals);
    next();
  });

  app.use(
    createSessionMiddleware({
      secret: config.secretKey,
      store: new PostgresSessionStore(),
      cookie: {
        name: config.sessionCookieNames,
        httpOnly: true,
        maxAge: config.sessionStoreExpireSeconds * 1000,
        secure: 'auto', // uses Express "trust proxy" setting
        sameSite: config.sessionCookieSameSite,
      },
    }),
  );

  app.use((req, res, next) => {
    // If the session is going to expire in the near future, we'll extend it
    // automatically for the user.
    //
    // TODO: make this configurable?
    if (req.session.getExpirationDate().getTime() < Date.now() + 60 * 60 * 1000) {
      req.session.setExpiration(config.sessionStoreExpireSeconds);
    }

    next();
  });

  app.use(function (req, res, next) {
    if (req.headers['user-agent']) {
      res.locals.userAgent = Bowser.parse(req.headers['user-agent']);
    } else {
      res.locals.userAgent = null;
    }
    next();
  });

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
  config.fileUploadMaxBytesFormatted = filesize(config.fileUploadMaxBytes, {
    base: 10,
    round: 0,
  });
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/uploads',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id',
    upload.single('file'),
  );
  app.post('/pl/course/:course_id/question/:question_id', upload.single('file'));
  app.post('/pl/course/:course_id/question/:question_id/file_view', upload.single('file'));
  app.post('/pl/course/:course_id/question/:question_id/file_view/*', upload.single('file'));
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/settings',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/instance_admin/settings',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/course_admin/settings',
    upload.single('file'),
  );
  app.post('/pl/course/:course_id/course_admin/settings', upload.single('file'));
  app.post('/pl/course/:course_id/course_admin/file_view', upload.single('file'));
  app.post('/pl/course/:course_id/course_admin/file_view/*', upload.single('file'));
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/course_admin/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/course_admin/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view/*',
    upload.single('file'),
  );
  app.post(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/groups',
    upload.single('file'),
  );

  /**
   * Function to strip "sensitive" cookies from requests that will be proxied
   * to workspace hosts.
   */
  function stripSensitiveCookies(proxyReq) {
    const cookies = proxyReq.getHeader('cookie');
    if (!cookies) return;

    const items = cookies.split(';');
    const filteredItems = items.filter((item) => {
      const name = item.split('=')[0].trim();
      return (
        name !== 'pl_authn' &&
        name !== 'pl_assessmentpw' &&
        name !== 'connect.sid' &&
        name !== 'prairielearn_session' &&
        // The workspace authz cookies use a prefix plus the workspace ID, so
        // we need to check for that prefix instead of an exact name match.
        !name.startsWith('pl_authz_workspace_')
      );
    });

    proxyReq.setHeader('cookie', filteredItems.join(';'));
  }

  // Collect metrics on workspace proxy sockets. Note that this only tracks
  // outgoing sockets (those going to workspaces). Incoming sockets are tracked
  // globally for the entire server.
  const meter = opentelemetry.metrics.getMeter('prairielearn');
  const workspaceProxySocketActivityMetrics = new SocketActivityMetrics(meter, 'workspace-proxy');
  workspaceProxySocketActivityMetrics.start();

  // proxy workspaces to remote machines
  const workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
  const workspaceProxyOptions = {
    target: 'invalid',
    ws: true,
    pathRewrite: async (path) => {
      try {
        const match = path.match('/pl/workspace/([0-9]+)/container/(.*)');
        if (!match) throw new Error(`Could not match path: ${path}`);
        const workspace_id = parseInt(match[1]);
        let workspace_url_rewrite = workspaceUrlRewriteCache.get(workspace_id);
        if (workspace_url_rewrite == null) {
          debug(`pathRewrite: querying workspace_url_rewrite for workspace_id=${workspace_id}`);
          const sql =
            'SELECT q.workspace_url_rewrite' +
            ' FROM questions AS q' +
            ' JOIN variants AS v ON (v.question_id = q.id)' +
            ' WHERE v.workspace_id = $workspace_id;';
          const result = await sqldb.queryOneRowAsync(sql, { workspace_id });
          workspace_url_rewrite = result.rows[0].workspace_url_rewrite;
          if (workspace_url_rewrite == null) workspace_url_rewrite = true;
          workspaceUrlRewriteCache.set(workspace_id, workspace_url_rewrite);
        }
        debug(
          `pathRewrite: found workspace_url_rewrite=${workspace_url_rewrite} for workspace_id=${workspace_id}`,
        );
        if (!workspace_url_rewrite) {
          return path;
        }
        var pathSuffix = match[2];
        const newPath = '/' + pathSuffix;
        return newPath;
      } catch (err) {
        logger.error(`Error in pathRewrite for path=${path}: ${err}`);
        return path;
      }
    },
    logLevel: 'silent',
    logProvider: (_provider) => logger,
    router: async (req) => {
      const match = req.url.match(/^\/pl\/workspace\/([0-9]+)\/container\//);
      if (!match) throw new Error(`Could not match URL: ${req.url}`);

      const workspace_id = match[1];
      const result = await sqldb.queryZeroOrOneRowAsync(
        "SELECT hostname FROM workspaces WHERE id = $workspace_id AND state = 'running';",
        { workspace_id },
      );

      if (result.rows.length === 0) {
        // If updating this message, also update the message our Sentry
        // `beforeSend` handler.
        throw error.make(404, 'Workspace is not running');
      }

      return `http://${result.rows[0].hostname}/`;
    },
    onProxyReq: (proxyReq) => {
      stripSensitiveCookies(proxyReq);
    },
    onProxyReqWs: (proxyReq) => {
      stripSensitiveCookies(proxyReq);
    },
    onError: (err, req, res) => {
      logger.error(`Error proxying workspace request: ${err}`, {
        err,
        url: req.url,
        originalUrl: req.originalUrl,
      });
      // Check to make sure we weren't already in the middle of sending a
      // response before replying with an error 500
      if (res && !res.headersSent) {
        if (res.status && res.send) {
          res.status(err.status ?? 500).send('Error proxying workspace request');
        }
      }
    },
  };
  const workspaceProxy = createProxyMiddleware((pathname) => {
    return pathname.match('/pl/workspace/([0-9])+/container/');
  }, workspaceProxyOptions);
  const workspaceAuthRouter = express.Router();
  workspaceAuthRouter.use([
    // We use a short-lived cookie to cache a successful
    // authn/authz for a specific workspace. We run the following
    // middlewares in this separate sub-router so that we can
    // short-circuit out of authzWorkspaceCookieCheck if we find
    // the workspace-authz cookie. Short-circuiting will exit this
    // sub-router immediately, so we can either exit this
    // sub-router by finding the cookie, or by running regular
    // authn/authz.

    require('./middlewares/authzWorkspaceCookieCheck'), // short-circuits if we have the workspace-authz cookie
    require('./middlewares/date'),
    require('./middlewares/authn'), // jumps to error handler if authn fails
    require('./middlewares/authzWorkspace'), // jumps to error handler if authz fails
    require('./middlewares/authzWorkspaceCookieSet'), // sets the workspace-authz cookie
  ]);
  app.use('/pl/workspace/:workspace_id/container', [
    cookieParser(),
    (req, res, next) => {
      // Needed for workspaceAuthRouter.
      res.locals.workspace_id = req.params.workspace_id;
      next();
    },
    workspaceAuthRouter,
    (req, res, next) => {
      workspaceProxySocketActivityMetrics.addSocket(req.socket);
      next();
    },
    workspaceProxy,
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
      if (ERR(err, () => {})) {
        logger.verbose('request on-response-finished error', {
          err,
          response_id: res.locals.response_id,
        });
      }
      load.endJob('request', res.locals.response_id);
    });
    next();
  });

  // More middlewares
  app.use(flashMiddleware());
  app.use((req, res, next) => {
    // This is so that the `navbar` partial can access the flash messages. If
    // you want to add a flash message, you should import and use `flash`
    // directly from `@prairielearn/flash`.
    res.locals.flash = flash;
    next();
  });
  app.use(require('./middlewares/logResponse')); // defers to end of response
  app.use(require('./middlewares/cors'));
  app.use(require('./middlewares/content-security-policy').default);
  app.use(require('./middlewares/date'));
  app.use(require('./middlewares/effectiveRequestChanged'));

  app.use('/pl/oauth2login', require('./pages/authLoginOAuth2/authLoginOAuth2'));
  app.use('/pl/oauth2callback', require('./pages/authCallbackOAuth2/authCallbackOAuth2'));
  app.use(/\/pl\/shibcallback/, require('./pages/authCallbackShib/authCallbackShib'));

  if (isEnterprise()) {
    if (config.hasAzure) {
      app.use('/pl/azure_login', require('./ee/auth/azure/login').default);
      app.use('/pl/azure_callback', require('./ee/auth/azure/callback').default);
    }

    app.use('/pl/lti13_instance', require('./ee/routers/lti13').default);
    app.use('/pl/auth/institution/:institution_id/saml', require('./ee/auth/saml/router').default);
  }

  app.use('/pl/lti', require('./pages/authCallbackLti/authCallbackLti'));
  app.use('/pl/login', require('./pages/authLogin/authLogin').default);
  if (config.devMode) {
    app.use('/pl/dev_login', require('./pages/authLoginDev/authLoginDev'));
  }
  app.use('/pl/logout', [
    function (req, res, next) {
      res.locals.navPage = 'logout';
      next();
    },
    require('./pages/authLogout/authLogout').default,
  ]);
  // disable SEB until we can fix the mcrypt issues
  // app.use('/pl/downloadSEBConfig', require('./pages/studentSEBConfig/studentSEBConfig'));
  app.use(require('./middlewares/authn')); // authentication, set res.locals.authn_user
  app.use('/pl/api', require('./middlewares/authnToken')); // authn for the API, set res.locals.authn_user

  // Must come after the authentication middleware, as we need to read the
  // `authn_is_administrator` property from the response locals.
  //
  // This means that feature flag overrides will not be available for
  // unauthenticated routes.
  app.use(featuresMiddleware((req, res) => res.locals.authn_is_administrator));

  if (isEnterprise()) {
    app.use('/pl/prairietest/auth', require('./ee/auth/prairietest').default);
  }

  // Must come before CSRF middleware; we do our own signature verification here.
  app.use('/pl/webhooks/terminate', require('./webhooks/terminate').default);
  app.use(
    '/pl/webhooks/stripe',
    enterpriseOnlyMiddleware(() => require('./ee/webhooks/stripe').default),
  );

  app.use(require('./middlewares/csrfToken')); // sets and checks res.locals.__csrf_token
  app.use(require('./middlewares/logRequest'));

  // load accounting for authenticated accesses
  app.use(function (req, res, next) {
    load.startJob('authed_request', res.locals.response_id);
    next();
  });
  app.use(function (req, res, next) {
    onFinished(res, function (err, res) {
      if (ERR(err, () => {})) {
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
  app.use(/^(\/?)$|^(\/pl\/?)$/, require('./middlewares/clearCookies'));

  // some pages don't need authorization
  app.use('/', require('./pages/home/home'));
  app.use('/pl', require('./pages/home/home'));
  app.use('/pl/settings', require('./pages/userSettings/userSettings').default);
  app.use('/pl/enroll', require('./pages/enroll/enroll').default);
  app.use('/pl/password', [
    function (req, res, next) {
      res.locals.navPage = 'password';
      next();
    },
    require('./pages/authPassword/authPassword'),
  ]);
  app.use('/pl/news_items', [
    function (req, res, next) {
      res.locals.navPage = 'news';
      next();
    },
    require('./pages/news_items/news_items.js'),
  ]);
  app.use('/pl/news_item', [
    function (req, res, next) {
      res.locals.navPage = 'news';
      next();
    },
    function (req, res, next) {
      res.locals.navSubPage = 'news_item';
      next();
    },
    require('./pages/news_item/news_item.js'),
  ]);
  app.use(
    '/pl/request_course',
    require('./pages/instructorRequestCourse/instructorRequestCourse').default,
  );

  // We deliberately omit the `authzCourseOrInstance` middleware here. The
  // route handler will only ever display courses for which the user has staff
  // access; the course ID in the URL is only used to determine which course
  // is the currently selected one.
  app.use(
    '/pl/navbar/course/:course_id/switcher',
    require('./pages/navbarCourseSwitcher/navbarCourseSwitcher').default,
  );
  app.use('/pl/navbar/course/:course_id/course_instance_switcher/:course_instance_id?', [
    require('./middlewares/authzCourseOrInstance'),
    require('./pages/navbarCourseInstanceSwitcher/navbarCourseInstanceSwitcher').default,
  ]);

  app.use('/pl/workspace/:workspace_id', [
    (req, res, next) => {
      res.locals.workspace_id = req.params.workspace_id;
      next();
    },
    require('./middlewares/authzWorkspace'),
  ]);
  app.use('/pl/workspace/:workspace_id', require('./pages/workspace/workspace'));
  app.use('/pl/workspace/:workspace_id/logs', require('./pages/workspaceLogs/workspaceLogs'));

  // dev-mode pages are mounted for both out-of-course access (here) and within-course access (see below)
  if (config.devMode) {
    app.use('/pl/loadFromDisk', [
      function (req, res, next) {
        res.locals.navPage = 'load_from_disk';
        next();
      },
      require('./pages/instructorLoadFromDisk/instructorLoadFromDisk').default,
    ]);
    app.use('/pl/jobSequence', [
      function (req, res, next) {
        res.locals.navPage = 'job_sequence';
        next();
      },
      require('./pages/instructorJobSequence/instructorJobSequence').default,
    ]);
  }

  // Redirect plain course instance page either to student or instructor assessments page
  app.use(/^(\/pl\/course_instance\/[0-9]+)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/assessments`);
  });
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/instance_admin/assessments`);
  });

  // is the course instance being accessed through the student or instructor page route
  app.use('/pl/course_instance/:course_instance_id', function (req, res, next) {
    res.locals.viewType = 'student';
    next();
  });
  app.use('/pl/course_instance/:course_instance_id/instructor', function (req, res, next) {
    res.locals.viewType = 'instructor';
    next();
  });

  // sets res.locals.course and res.locals.course_instance
  app.use(
    '/pl/course_instance/:course_instance_id',
    require('./middlewares/authzCourseOrInstance'),
  );

  // This must come after `authzCourseOrInstance` but before the `checkPlanGrants`
  // or `autoEnroll` middlewares so that we can render it even when the student
  // isn't enrolled in the course instance or doesn't have the necessary plan grants.
  if (isEnterprise()) {
    // This must come before `authzHasCourseInstanceAccess` and the upgrade page
    // below so that we can render it even when the student isn't enrolled in the
    // course instance.
    app.use('/pl/course_instance/:course_instance_id/upgrade', [
      require('./ee/pages/studentCourseInstanceUpgrade/studentCourseInstanceUpgrade').default,
    ]);
  }

  // all pages under /pl/course_instance require authorization
  app.use('/pl/course_instance/:course_instance_id', [
    enterpriseOnlyMiddleware(() => require('./ee/middlewares/checkPlanGrants').default),
    require('./middlewares/autoEnroll').default,
    function (req, res, next) {
      res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id;
      next();
    },
    function (req, res, next) {
      res.locals.navbarType = 'student';
      next();
    },
    require('./middlewares/ansifySyncErrorsAndWarnings.js'),
  ]);

  // Some course instance student pages only require course instance authorization (already checked)
  app.use(
    '/pl/course_instance/:course_instance_id/news_items',
    require('./pages/news_items/news_items.js'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/news_item',
    require('./pages/news_item/news_item.js'),
  );

  // Some course instance student pages only require the authn user to have permissions
  app.use('/pl/course_instance/:course_instance_id/effectiveUser', [
    require('./middlewares/authzAuthnHasCoursePreviewOrInstanceView'),
    require('./pages/instructorEffectiveUser/instructorEffectiveUser').default,
  ]);

  // All course instance instructor pages require the authn user to have permissions
  app.use('/pl/course_instance/:course_instance_id/instructor', [
    require('./middlewares/authzAuthnHasCoursePreviewOrInstanceView'),
    require('./middlewares/selectOpenIssueCount'),
    function (req, res, next) {
      res.locals.navbarType = 'instructor';
      next();
    },
    function (req, res, next) {
      res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id + '/instructor';
      next();
    },
  ]);

  // Some course instance instructor pages only require the authn user to have permissions (already checked)
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/effectiveUser',
    require('./pages/instructorEffectiveUser/instructorEffectiveUser').default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/news_items',
    require('./pages/news_items/news_items.js'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/news_item',
    require('./pages/news_item/news_item.js'),
  );

  // All other course instance student pages require the effective user to have permissions
  app.use(
    '/pl/course_instance/:course_instance_id',
    require('./middlewares/authzHasCourseInstanceAccess'),
  );

  // All other course instance instructor pages require the effective user to have permissions
  app.use(
    '/pl/course_instance/:course_instance_id/instructor',
    require('./middlewares/authzHasCoursePreviewOrInstanceView'),
  );

  // all pages under /pl/course require authorization
  app.use('/pl/course/:course_id', [
    require('./middlewares/authzCourseOrInstance'), // set res.locals.course
    require('./middlewares/ansifySyncErrorsAndWarnings.js'),
    require('./middlewares/selectOpenIssueCount'),
    function (req, res, next) {
      res.locals.navbarType = 'instructor';
      next();
    },
    function (req, res, next) {
      res.locals.urlPrefix = '/pl/course/' + req.params.course_id;
      next();
    },
  ]);

  // Serve element statics. As with core PrairieLearn assets and files served
  // from `node_modules`, we include a cachebuster in the URL. This allows
  // files to be treated as immutable in production and cached aggressively.
  app.use(
    '/pl/course_instance/:course_instance_id/cacheableElements/:cachebuster',
    require('./pages/elementFiles/elementFiles'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/cacheableElements/:cachebuster',
    require('./pages/elementFiles/elementFiles'),
  );
  app.use(
    '/pl/course/:course_id/cacheableElements/:cachebuster',
    require('./pages/elementFiles/elementFiles'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/cacheableElementExtensions/:cachebuster',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/cacheableElementExtensions/:cachebuster',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );
  app.use(
    '/pl/course/:course_id/cacheableElementExtensions/:cachebuster',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );

  // For backwards compatibility, we continue to serve the non-cached element
  // files.
  // TODO: if we can determine that these routes are no longer receiving
  // traffic in the future, we can delete these.
  //
  // TODO: the only internal usage of this is in the `pl-drawing` element. Fix that.
  app.use('/pl/static/elements', require('./pages/elementFiles/elementFiles'));
  app.use(
    '/pl/course_instance/:course_instance_id/elements',
    require('./pages/elementFiles/elementFiles'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/elements',
    require('./pages/elementFiles/elementFiles'),
  );
  app.use('/pl/course/:course_id/elements', require('./pages/elementFiles/elementFiles'));
  app.use(
    '/pl/course_instance/:course_instance_id/elementExtensions',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/elementExtensions',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );
  app.use(
    '/pl/course/:course_id/elementExtensions',
    require('./pages/elementExtensionFiles/elementExtensionFiles'),
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // API ///////////////////////////////////////////////////////////////

  app.use('/pl/api/v1', require('./api/v1'));

  if (isEnterprise()) {
    app.use(
      '/pl/institution/:institution_id/admin',
      require('./ee/routers/institutionAdmin').default,
    );
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Instructor pages //////////////////////////////////////////////////

  // single assessment
  app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id', [
    require('./middlewares/selectAndAuthzAssessment'),
    require('./middlewares/ansifySyncErrorsAndWarnings.js'),
    require('./middlewares/selectAssessments'),
  ]);
  app.use(
    /^(\/pl\/course_instance\/[0-9]+\/instructor\/assessment\/[0-9]+)\/?$/,
    (req, res, _next) => {
      res.redirect(`${req.params[0]}/questions`);
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id',
    function (req, res, next) {
      res.locals.navPage = 'assessment';
      next();
    },
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorAssessmentSettings/instructorAssessmentSettings').default,
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/questions',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'questions';
        next();
      },
      require('./pages/instructorAssessmentQuestions/instructorAssessmentQuestions').default,
    ],
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/groups', [
    function (req, res, next) {
      res.locals.navSubPage = 'groups';
      next();
    },
    require('./pages/instructorAssessmentGroups/instructorAssessmentGroups').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/access', [
    function (req, res, next) {
      res.locals.navSubPage = 'access';
      next();
    },
    require('./pages/instructorAssessmentAccess/instructorAssessmentAccess').default,
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/assessment_statistics',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'assessment_statistics';
        next();
      },
      require('./pages/instructorAssessmentStatistics/instructorAssessmentStatistics').default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/question_statistics',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'question_statistics';
        next();
      },
      require('./pages/shared/assessmentStatDescriptions'),
      require('./pages/shared/floatFormatters'),
      require('./pages/instructorAssessmentQuestionStatistics/instructorAssessmentQuestionStatistics')
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/downloads',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'downloads';
        next();
      },
      require('./pages/instructorAssessmentDownloads/instructorAssessmentDownloads').default,
    ],
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/uploads', [
    function (req, res, next) {
      res.locals.navSubPage = 'uploads';
      next();
    },
    require('./pages/instructorAssessmentUploads/instructorAssessmentUploads').default,
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/regrading',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'regrading';
        next();
      },
      require('./pages/instructorAssessmentRegrading/instructorAssessmentRegrading').default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/instances',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'instances';
        next();
      },
      require('./pages/instructorAssessmentInstances/instructorAssessmentInstances').default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_edit',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'file_edit';
        next();
      },
      require('./pages/instructorFileEditor/instructorFileEditor').default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'file_view';
        next();
      },
      require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/assessment_question/:assessment_question_id',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      require('./middlewares/selectAndAuthzAssessmentQuestion'),
      require('./pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion')
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading/instance_question/:instance_question_id',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/instructorAssessmentManualGrading/instanceQuestion/instanceQuestion')
        .default,
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/clientFilesQuestion',
    [
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/clientFilesQuestion/clientFilesQuestion')(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/generatedFilesQuestion',
    [
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/generatedFilesQuestion/generatedFilesQuestion')(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/file',
    [
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/legacyQuestionFile/legacyQuestionFile'),
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/text',
    [
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/legacyQuestionText/legacyQuestionText'),
    ],
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/submission/:submission_id/file',
    [
      require('./middlewares/selectAndAuthzInstanceQuestion').default,
      require('./pages/submissionFile/submissionFile')(),
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading',
    [
      function (req, res, next) {
        res.locals.navSubPage = 'manual_grading';
        next();
      },
      require('./pages/instructorAssessmentManualGrading/assessment/assessment').default,
    ],
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment_instance/:assessment_instance_id',
    [
      require('./middlewares/selectAndAuthzAssessmentInstance'),
      require('./pages/shared/floatFormatters'),
      require('./pages/instructorAssessmentInstance/instructorAssessmentInstance').default,
    ],
  );

  // single question
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./middlewares/ansifySyncErrorsAndWarnings.js'),
  ]);
  app.use(
    /^(\/pl\/course_instance\/[0-9]+\/instructor\/question\/[0-9]+)\/?$/,
    (req, res, _next) => {
      // Redirect legacy question URLs to their preview page.
      // We need to maintain query parameters like `variant_id` so that the
      // preview page can render the correct variant.
      const newUrl = `${req.params[0]}/preview`;
      const newUrlParts = url.parse(newUrl);
      newUrlParts.query = req.query;
      res.redirect(url.format(newUrlParts));
    },
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id',
    function (req, res, next) {
      res.locals.navPage = 'question';
      next();
    },
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorQuestionSettings/instructorQuestionSettings').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview', [
    function (req, res, next) {
      res.locals.navSubPage = 'preview';
      next();
    },
    require('./pages/shared/floatFormatters'),
    require('./pages/instructorQuestionPreview/instructorQuestionPreview'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/statistics', [
    function (req, res, next) {
      res.locals.navSubPage = 'statistics';
      next();
    },
    require('./pages/shared/assessmentStatDescriptions'),
    require('./pages/shared/floatFormatters'),
    require('./pages/instructorQuestionStatistics/instructorQuestionStatistics').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_edit', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_edit';
      next();
    },
    require('./pages/instructorFileEditor/instructorFileEditor').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_view';
      next();
    },
    require('./pages/instructorFileBrowser/instructorFileBrowser'),
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );

  app.use(
    '/pl/course_instance/:course_instance_id/instructor/grading_job',
    require('./pages/instructorGradingJob/instructorGradingJob').default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/jobSequence',
    require('./pages/instructorJobSequence/instructorJobSequence').default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/loadFromDisk',
    require('./pages/instructorLoadFromDisk/instructorLoadFromDisk').default,
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/edit_error',
    require('./pages/editError/editError'),
  );

  // course instance - course admin pages
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/course_admin)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/instances`);
  });
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/course_admin',
    function (req, res, next) {
      res.locals.navPage = 'course_admin';
      next();
    },
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/sharing', [
    function (req, res, next) {
      res.locals.navSubPage = 'sharing';
      next();
    },
    require('./pages/instructorCourseAdminSharing/instructorCourseAdminSharing'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/staff', [
    function (req, res, next) {
      res.locals.navSubPage = 'staff';
      next();
    },
    require('./pages/instructorCourseAdminStaff/instructorCourseAdminStaff').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/sets', [
    function (req, res, next) {
      res.locals.navSubPage = 'sets';
      next();
    },
    require('./pages/instructorCourseAdminSets/instructorCourseAdminSets').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/instances', [
    function (req, res, next) {
      res.locals.navSubPage = 'instances';
      next();
    },
    require('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/issues', [
    function (req, res, next) {
      res.locals.navSubPage = 'issues';
      next();
    },
    require('./pages/instructorIssues/instructorIssues').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/questions', [
    function (req, res, next) {
      res.locals.navSubPage = 'questions';
      next();
    },
    require('./pages/instructorQuestions/instructorQuestions').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/syncs', [
    function (req, res, next) {
      res.locals.navSubPage = 'syncs';
      next();
    },
    require('./pages/courseSyncs/courseSyncs'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/topics', [
    function (req, res, next) {
      res.locals.navSubPage = 'topics';
      next();
    },
    require('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/tags', [
    function (req, res, next) {
      res.locals.navSubPage = 'tags';
      next();
    },
    require('./pages/instructorCourseAdminTags/instructorCourseAdminTags').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/file_edit', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_edit';
      next();
    },
    require('./pages/instructorFileEditor/instructorFileEditor').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/file_view', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_view';
      next();
    },
    require('./pages/instructorFileBrowser/instructorFileBrowser'),
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/course_admin/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );

  // course instance - instance admin pages
  app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/instance_admin)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/assessments`);
  });
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_admin',
    function (req, res, next) {
      res.locals.navPage = 'instance_admin';
      next();
    },
    asyncHandler(async (req, res, next) => {
      // The navigation tabs rely on this value to know when to show/hide the
      // billing tab, so we need to load it for all instance admin pages.
      const hasCourseInstanceBilling = await features.enabledFromLocals(
        'course-instance-billing',
        res.locals,
      );
      res.locals.billing_enabled = hasCourseInstanceBilling && isEnterprise();
      next();
    }),
  );
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorInstanceAdminSettings/instructorInstanceAdminSettings').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/access', [
    function (req, res, next) {
      res.locals.navSubPage = 'access';
      next();
    },
    require('./pages/instructorInstanceAdminAccess/instructorInstanceAdminAccess').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments', [
    function (req, res, next) {
      res.locals.navSubPage = 'assessments';
      next();
    },
    require('./pages/instructorAssessments/instructorAssessments').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/gradebook', [
    function (req, res, next) {
      res.locals.navSubPage = 'gradebook';
      next();
    },
    require('./pages/instructorGradebook/instructorGradebook').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/lti', [
    function (req, res, next) {
      res.locals.navSubPage = 'lti';
      next();
    },
    require('./pages/instructorInstanceAdminLti/instructorInstanceAdminLti').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_edit', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_edit';
      next();
    },
    require('./pages/instructorFileEditor/instructorFileEditor').default,
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_view';
      next();
    },
    require('./pages/instructorFileBrowser/instructorFileBrowser'),
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/instance_admin/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );
  if (isEnterprise()) {
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/billing', [
      function (req, res, next) {
        res.locals.navSubPage = 'billing';
        next();
      },
      require('./ee/pages/instructorInstanceAdminBilling/instructorInstanceAdminBilling').default,
    ]);
  }

  // Global client files
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/clientFilesCourseInstance',
    require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'),
  );

  // Client files for assessments
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesCourseInstance',
    require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesAssessment',
    [
      require('./middlewares/selectAndAuthzAssessment'),
      require('./pages/clientFilesAssessment/clientFilesAssessment'),
    ],
  );

  // Client files for questions
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesQuestion',
    [
      require('./middlewares/selectAndAuthzInstructorQuestion'),
      require('./pages/clientFilesQuestion/clientFilesQuestion')(),
    ],
  );

  // generatedFiles
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/generatedFilesQuestion',
    [
      require('./middlewares/selectAndAuthzInstructorQuestion'),
      require('./pages/generatedFilesQuestion/generatedFilesQuestion')(),
    ],
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id/instructor/question/:question_id/submission/:submission_id/file',
    [
      require('./middlewares/selectAndAuthzInstructorQuestion'),
      require('./pages/submissionFile/submissionFile')(),
    ],
  );

  // legacy client file paths
  // handle routes with and without /preview/ in them to handle URLs with and without trailing slashes
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionFile/legacyQuestionFile'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/file', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionFile/legacyQuestionFile'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/text', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionText/legacyQuestionText'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview/text', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionText/legacyQuestionText'),
  ]);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Student pages /////////////////////////////////////////////////////

  app.use('/pl/course_instance/:course_instance_id/gradebook', [
    function (req, res, next) {
      res.locals.navSubPage = 'gradebook';
      next();
    },
    require('./middlewares/logPageView')('studentGradebook'),
    require('./pages/studentGradebook/studentGradebook'),
  ]);
  app.use('/pl/course_instance/:course_instance_id/assessments', [
    function (req, res, next) {
      res.locals.navSubPage = 'assessments';
      next();
    },
    require('./middlewares/logPageView')('studentAssessments'),
    require('./pages/studentAssessments/studentAssessments'),
  ]);
  // Exam/Homeworks student routes are polymorphic - they have multiple handlers, each of
  // which checks the assessment type and calls next() if it's not the right type
  app.use('/pl/course_instance/:course_instance_id/assessment/:assessment_id', [
    require('./middlewares/selectAndAuthzAssessment'),
    require('./middlewares/studentAssessmentAccess'),
    require('./middlewares/logPageView')('studentAssessment'),
    require('./pages/studentAssessment/studentAssessment'),
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/file',
    [
      require('./middlewares/selectAndAuthzAssessmentInstance'),
      require('./middlewares/studentAssessmentAccess'),
      require('./middlewares/clientFingerprint').default,
      require('./middlewares/logPageView')('studentAssessmentInstanceFile'),
      require('./pages/studentAssessmentInstanceFile/studentAssessmentInstanceFile'),
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/time_remaining',
    [
      require('./middlewares/selectAndAuthzAssessmentInstance'),
      require('./middlewares/studentAssessmentAccess'),
      require('./pages/studentAssessmentInstanceTimeRemaining/studentAssessmentInstanceTimeRemaining'),
    ],
  );
  app.use('/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id', [
    require('./middlewares/selectAndAuthzAssessmentInstance'),
    require('./middlewares/studentAssessmentAccess'),
    require('./middlewares/clientFingerprint').default,
    require('./middlewares/logPageView')('studentAssessmentInstance'),
    require('./pages/studentAssessmentInstance/studentAssessmentInstance').default,
  ]);

  app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id', [
    require('./middlewares/selectAndAuthzInstanceQuestion').default,
    require('./middlewares/studentAssessmentAccess'),
    require('./middlewares/clientFingerprint').default,
    // don't use logPageView here, we load it inside the page so it can get the variant_id
    enterpriseOnlyMiddleware(() => require('./ee/middlewares/checkPlanGrantsForQuestion').default),
    require('./pages/studentInstanceQuestion/studentInstanceQuestion').default,
  ]);
  if (config.devMode) {
    app.use(
      '/pl/course_instance/:course_instance_id/loadFromDisk',
      require('./pages/instructorLoadFromDisk/instructorLoadFromDisk').default,
    );
    app.use(
      '/pl/course_instance/:course_instance_id/jobSequence',
      require('./pages/instructorJobSequence/instructorJobSequence').default,
    );
  }

  // Global client files
  app.use(
    '/pl/course_instance/:course_instance_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/clientFilesCourseInstance',
    require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'),
  );

  // Client files for assessments
  app.use('/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesCourse', [
    require('./middlewares/selectAndAuthzAssessment'),
    require('./middlewares/studentAssessmentAccess'),
    require('./pages/clientFilesCourse/clientFilesCourse'),
  ]);
  app.use(
    '/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesCourseInstance',
    [
      require('./middlewares/selectAndAuthzAssessment'),
      require('./middlewares/studentAssessmentAccess'),
      require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'),
    ],
  );
  app.use(
    '/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesAssessment',
    [
      require('./middlewares/selectAndAuthzAssessment'),
      require('./middlewares/studentAssessmentAccess'),
      require('./pages/clientFilesAssessment/clientFilesAssessment'),
    ],
  );

  // Client files for questions
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesQuestion',
    require('./pages/clientFilesQuestion/clientFilesQuestion')(),
  );

  // generatedFiles
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/generatedFilesQuestion',
    require('./pages/generatedFilesQuestion/generatedFilesQuestion')(),
  );

  // Submission files
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/submission/:submission_id/file',
    require('./pages/submissionFile/submissionFile')(),
  );

  // legacy client file paths
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/file',
    require('./pages/legacyQuestionFile/legacyQuestionFile'),
  );
  app.use(
    '/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/text',
    require('./pages/legacyQuestionText/legacyQuestionText'),
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Course pages //////////////////////////////////////////////////////

  app.use(/^\/pl\/course\/[0-9]+\/?$/, function (req, res, _next) {
    res.redirect(res.locals.urlPrefix + '/course_admin');
  }); // redirect plain course URL to overview page

  // Some course pages only require the authn user to have permission (aleady checked)
  app.use(
    '/pl/course/:course_id/effectiveUser',
    require('./pages/instructorEffectiveUser/instructorEffectiveUser').default,
  );
  app.use('/pl/course/:course_id/news_items', require('./pages/news_items/news_items.js'));
  app.use('/pl/course/:course_id/news_item', require('./pages/news_item/news_item.js'));

  // All other course pages require the effective user to have permission
  app.use('/pl/course/:course_id', require('./middlewares/authzHasCoursePreview'));

  // single question

  app.use('/pl/course/:course_id/question/:question_id', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./middlewares/ansifySyncErrorsAndWarnings.js'),
  ]);
  app.use(/^(\/pl\/course\/[0-9]+\/question\/[0-9]+)\/?$/, (req, res, _next) => {
    // Redirect legacy question URLs to their preview page.
    // We need to maintain query parameters like `variant_id` so that the
    // preview page can render the correct variant.
    const newUrl = `${req.params[0]}/preview`;
    const newUrlParts = url.parse(newUrl);
    newUrlParts.query = req.query;
    res.redirect(url.format(newUrlParts));
  });
  app.use('/pl/course/:course_id/question/:question_id', function (req, res, next) {
    res.locals.navPage = 'question';
    next();
  });
  app.use('/pl/course/:course_id/question/:question_id/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorQuestionSettings/instructorQuestionSettings').default,
  ]);
  app.use('/pl/course/:course_id/question/:question_id/preview', [
    function (req, res, next) {
      res.locals.navSubPage = 'preview';
      next();
    },
    require('./pages/shared/floatFormatters'),
    require('./pages/instructorQuestionPreview/instructorQuestionPreview'),
  ]);
  app.use('/pl/course/:course_id/question/:question_id/statistics', [
    function (req, res, next) {
      res.locals.navSubPage = 'statistics';
      next();
    },
    require('./pages/shared/assessmentStatDescriptions'),
    require('./pages/shared/floatFormatters'),
    require('./pages/instructorQuestionStatistics/instructorQuestionStatistics').default,
  ]);
  app.use('/pl/course/:course_id/question/:question_id/file_edit', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_edit';
      next();
    },
    require('./pages/instructorFileEditor/instructorFileEditor').default,
  ]);
  app.use('/pl/course/:course_id/question/:question_id/file_view', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_view';
      next();
    },
    require('./pages/instructorFileBrowser/instructorFileBrowser'),
  ]);
  app.use(
    '/pl/course/:course_id/question/:question_id/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );

  app.use('/pl/course/:course_id/file_transfer', [
    require('./pages/instructorFileTransfer/instructorFileTransfer').default,
  ]);

  app.use('/pl/course/:course_id/edit_error', require('./pages/editError/editError'));

  app.use(/^(\/pl\/course\/[0-9]+\/course_admin)\/?$/, (req, res, _next) => {
    res.redirect(`${req.params[0]}/instances`);
  });
  app.use('/pl/course/:course_id/course_admin', function (req, res, next) {
    res.locals.navPage = 'course_admin';
    next();
  });
  app.use('/pl/course/:course_id/course_admin/settings', [
    function (req, res, next) {
      res.locals.navSubPage = 'settings';
      next();
    },
    require('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/sharing', [
    function (req, res, next) {
      res.locals.navSubPage = 'sharing';
      next();
    },
    require('./pages/instructorCourseAdminSharing/instructorCourseAdminSharing'),
  ]);
  app.use('/pl/course/:course_id/course_admin/staff', [
    function (req, res, next) {
      res.locals.navSubPage = 'staff';
      next();
    },
    require('./pages/instructorCourseAdminStaff/instructorCourseAdminStaff').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/sets', [
    function (req, res, next) {
      res.locals.navSubPage = 'sets';
      next();
    },
    require('./pages/instructorCourseAdminSets/instructorCourseAdminSets').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/instances', [
    function (req, res, next) {
      res.locals.navSubPage = 'instances';
      next();
    },
    require('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/issues', [
    function (req, res, next) {
      res.locals.navSubPage = 'issues';
      next();
    },
    require('./pages/instructorIssues/instructorIssues').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/questions', [
    function (req, res, next) {
      res.locals.navSubPage = 'questions';
      next();
    },
    require('./pages/instructorQuestions/instructorQuestions').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/syncs', [
    function (req, res, next) {
      res.locals.navSubPage = 'syncs';
      next();
    },
    require('./pages/courseSyncs/courseSyncs'),
  ]);
  app.use('/pl/course/:course_id/course_admin/topics', [
    function (req, res, next) {
      res.locals.navSubPage = 'topics';
      next();
    },
    require('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/tags', [
    function (req, res, next) {
      res.locals.navSubPage = 'tags';
      next();
    },
    require('./pages/instructorCourseAdminTags/instructorCourseAdminTags').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/file_edit', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_edit';
      next();
    },
    require('./pages/instructorFileEditor/instructorFileEditor').default,
  ]);
  app.use('/pl/course/:course_id/course_admin/file_view', [
    function (req, res, next) {
      res.locals.navSubPage = 'file_view';
      next();
    },
    require('./pages/instructorFileBrowser/instructorFileBrowser'),
  ]);
  app.use(
    '/pl/course/:course_id/course_admin/file_download',
    require('./pages/instructorFileDownload/instructorFileDownload').default,
  );

  app.use(
    '/pl/course/:course_id/loadFromDisk',
    require('./pages/instructorLoadFromDisk/instructorLoadFromDisk').default,
  );
  app.use(
    '/pl/course/:course_id/jobSequence',
    require('./pages/instructorJobSequence/instructorJobSequence').default,
  );
  app.use(
    '/pl/course/:course_id/grading_job',
    require('./pages/instructorGradingJob/instructorGradingJob').default,
  );

  // This route is used to initiate a transfer of a question from a template course.
  // It is not actually a page; it's just used to initiate the transfer. The reason
  // that this is a route on the target course and not handled by the source question
  // pages is that the source question pages are served by chunk servers, but the
  // question transfer machinery relies on access to course repositories on disk,
  // which don't exist on chunk servers
  app.use(
    '/pl/course/:course_id/copy_template_course_question',
    require('./pages/instructorCopyTemplateCourseQuestion/instructorCopyTemplateCourseQuestion')
      .default,
  );

  // Global client files
  app.use(
    '/pl/course/:course_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );

  // Client files for questions
  app.use(
    '/pl/course/:course_id/question/:question_id/clientFilesCourse',
    require('./pages/clientFilesCourse/clientFilesCourse'),
  );
  app.use('/pl/course/:course_id/question/:question_id/clientFilesQuestion', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/clientFilesQuestion/clientFilesQuestion')(),
  ]);

  // generatedFiles
  app.use('/pl/course/:course_id/question/:question_id/generatedFilesQuestion', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/generatedFilesQuestion/generatedFilesQuestion')(),
  ]);

  // Submission files
  app.use('/pl/course/:course_id/question/:question_id/submission/:submission_id/file', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/submissionFile/submissionFile')(),
  ]);

  // legacy client file paths
  // handle routes with and without /preview/ in them to handle URLs with and without trailing slashes
  app.use('/pl/course/:course_id/question/:question_id/file', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionFile/legacyQuestionFile'),
  ]);
  app.use('/pl/course/:course_id/question/:question_id/preview/file', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionFile/legacyQuestionFile'),
  ]);
  app.use('/pl/course/:course_id/question/:question_id/text', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionText/legacyQuestionText'),
  ]);
  app.use('/pl/course/:course_id/question/:question_id/preview/text', [
    require('./middlewares/selectAndAuthzInstructorQuestion'),
    require('./pages/legacyQuestionText/legacyQuestionText'),
  ]);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Public course pages ///////////////////////////////////////////////

  app.use('/pl/public/course/:course_id', [
    function (req, res, next) {
      res.locals.navbarType = 'public';
      res.locals.urlPrefix = '/pl/public/course/' + req.params.course_id;
      next();
    },
  ]);
  app.use('/pl/public/course/:course_id/question/:question_id/preview', [
    function (req, res, next) {
      res.locals.navPage = 'public_question';
      res.locals.navSubPage = 'preview';
      next();
    },
    require('./pages/shared/floatFormatters'),
    require('./pages/publicQuestionPreview/publicQuestionPreview'),
  ]);
  app.use('/pl/public/course/:course_id/questions', [
    function (req, res, next) {
      res.locals.navPage = 'public_questions';
      res.locals.navSubPage = 'questions';
      next();
    },
    require('./pages/publicQuestions/publicQuestions'),
  ]);

  // Client files for questions
  app.use(
    '/pl/public/course/:course_id/question/:question_id/clientFilesQuestion',
    require('./pages/clientFilesQuestion/clientFilesQuestion')({ publicEndpoint: true }),
  );

  // generatedFiles
  app.use(
    '/pl/public/course/:course_id/question/:question_id/generatedFilesQuestion',
    require('./pages/generatedFilesQuestion/generatedFilesQuestion')({ publicEndpoint: true }),
  );

  // Submission files
  app.use('/pl/public/course/:course_id/question/:question_id/submission/:submission_id/file', [
    require('./pages/submissionFile/submissionFile')({ publicEndpoint: true }),
  ]);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Administrator pages ///////////////////////////////////////////////

  app.use('/pl/administrator', require('./middlewares/authzIsAdministrator'));
  app.use(
    '/pl/administrator/admins',
    require('./pages/administratorAdmins/administratorAdmins').default,
  );
  app.use(
    '/pl/administrator/settings',
    require('./pages/administratorSettings/administratorSettings').default,
  );
  app.use(
    '/pl/administrator/institutions',
    require('./pages/administratorInstitutions/administratorInstitutions').default,
  );
  app.use(
    '/pl/administrator/courses',
    require('./pages/administratorCourses/administratorCourses').default,
  );
  app.use(
    '/pl/administrator/networks',
    require('./pages/administratorNetworks/administratorNetworks'),
  );
  app.use(
    '/pl/administrator/workspaces',
    require('./pages/administratorWorkspaces/administratorWorkspaces').default,
  );
  app.use(
    '/pl/administrator/features',
    require('./pages/administratorFeatures/administratorFeatures').default,
  );
  app.use(
    '/pl/administrator/queries',
    require('./pages/administratorQueries/administratorQueries').default,
  );
  app.use(
    '/pl/administrator/query',
    require('./pages/administratorQuery/administratorQuery').default,
  );
  app.use(
    '/pl/administrator/jobSequence/',
    require('./pages/administratorJobSequence/administratorJobSequence').default,
  );
  app.use(
    '/pl/administrator/courseRequests/',
    require('./pages/administratorCourseRequests/administratorCourseRequests').default,
  );
  app.use(
    '/pl/administrator/batchedMigrations',
    require('./pages/administratorBatchedMigrations/administratorBatchedMigrations').default,
  );

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Error handling ////////////////////////////////////////////////////

  // if no earlier routes matched, this will match and generate a 404 error
  app.use(require('./middlewares/notFound'));

  app.use(require('./middlewares/redirectEffectiveAccessDenied'));

  /**
   * Attempts to extract a numeric status code from a Postgres error object.
   * The convention we use is to use a `ERRCODE` value of `ST###`, where ###
   * is the three-digit HTTP status code.
   *
   * For example, the following exception would set a 404 status code:
   *
   * RAISE EXCEPTION 'Entity not found' USING ERRCODE = 'ST404';
   *
   * @param {any} err
   * @returns {number | null} The extracted HTTP status code
   */
  function maybeGetStatusCodeFromSqlError(err) {
    const rawCode = err?.data?.sqlError?.code;
    if (!rawCode?.startsWith('ST')) return null;

    const parsedCode = Number(rawCode.toString().substring(2));
    if (Number.isNaN(parsedCode)) return null;

    return parsedCode;
  }

  // This should come first so that both Sentry and our own error page can
  // read the error ID and any status code.
  app.use((err, req, res, next) => {
    const _ = require('lodash');
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    res.locals.error_id = _.times(12, () => _.sample(chars)).join('');

    err.status = err.status ?? maybeGetStatusCodeFromSqlError(err) ?? 500;

    next(err);
  });

  app.use(Sentry.Handlers.errorHandler());

  // Note that the Sentry error handler should come before our error page.
  app.use(require('./pages/error/error'));

  return app;
};

//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
// Server startup ////////////////////////////////////////////////////

/** @type {import('http').Server | import('https').Server} */
var server;

module.exports.startServer = async () => {
  const app = module.exports.initExpress();

  if (config.serverType === 'https') {
    const key = await fs.promises.readFile(config.sslKeyFile);
    const cert = await fs.promises.readFile(config.sslCertificateFile);
    const ca = [await fs.promises.readFile(config.sslCAFile)];
    var options = { key, cert, ca };
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
        resolve();
      }
    });
  });

  return server;
};

module.exports.stopServer = function (callback) {
  if (!server) return callback(new Error('cannot stop an undefined server'));
  if (!server.listening) return callback(null);

  // This exists mostly for tests, where we might have dangling connections
  // from `fetch()` requests whose bodies we never read. `server.close()` won't
  // actually stop the server until all connections are closed, so we need to
  // manually close said connections.
  //
  // In production environments, PrairieLearn should always be deployed behind
  // a load balancer that will drain and close any open connections before
  // PrairieLearn is stopped.
  server.closeAllConnections();

  server.close(function (err) {
    if (ERR(err, callback)) return;
    callback(null);
  });
};

module.exports.insertDevUser = function (callback) {
  // add dev user as Administrator
  var sql =
    'INSERT INTO users (uid, name)' +
    " VALUES ('dev@illinois.edu', 'Dev User')" +
    ' ON CONFLICT (uid) DO UPDATE' +
    ' SET name = EXCLUDED.name' +
    ' RETURNING user_id;';
  sqldb.queryOneRow(sql, [], function (err, result) {
    if (ERR(err, callback)) return;
    var user_id = result.rows[0].user_id;
    var sql =
      'INSERT INTO administrators (user_id)' +
      ' VALUES ($user_id)' +
      ' ON CONFLICT (user_id) DO NOTHING;';
    var params = { user_id };
    sqldb.query(sql, params, function (err, _result) {
      if (ERR(err, callback)) return;
      callback(null);
    });
  });
};

if (require.main === module && config.startServer) {
  async.series(
    [
      async () => {
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
        });

        // Same with Sentry configuration.
        if (config.sentryDsn) {
          const integrations = [];
          if (config.sentryTracesSampleRate && config.sentryProfilesSampleRate) {
            integrations.push(new ProfilingIntegration());
          }

          await Sentry.init({
            dsn: config.sentryDsn,
            environment: config.sentryEnvironment,
            integrations,
            tracesSampleRate: config.sentryTracesSampleRate,
            // This is relative to `tracesSampleRate`.
            profilesSampleRate: config.sentryProfilesSampleRate,
            beforeSend: (event) => {
              // This will be necessary until we can consume the following change:
              // https://github.com/chimurai/http-proxy-middleware/pull/823
              //
              // The following error message should match the error that's thrown
              // from the `router` function in our `http-proxy-middleware` config.
              if (
                event.exception?.values?.some(
                  (value) => value.type === 'Error' && value.value === 'Workspace is not running',
                )
              ) {
                return null;
              }

              return event;
            },
          });
        }

        if (config.logFilename) {
          addFileLogging({ filename: config.logFilename });
        }

        if (config.logErrorFilename) {
          addFileLogging({ filename: config.logErrorFilename, level: 'error' });
        }
      },
      async () => {
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
      },
      async () => {
        if (isEnterprise() && config.hasAzure) {
          const { getAzureStrategy } = require('./ee/auth/azure/index');
          passport.use(getAzureStrategy());
        }
      },
      async () => {
        if (isEnterprise()) {
          const { strategy } = require('./ee/auth/saml/index');
          passport.use(strategy);
        }
      },
      async function () {
        const pgConfig = {
          user: config.postgresqlUser,
          database: config.postgresqlDatabase,
          host: config.postgresqlHost,
          password: config.postgresqlPassword,
          max: config.postgresqlPoolSize,
          idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
          ssl: config.postgresqlSsl,
        };
        function idleErrorHandler(err) {
          logger.error('idle client error', err);
          Sentry.captureException(err, {
            level: 'fatal',
            tags: {
              // This may have been set by `sql-db.js`. We include this in the
              // Sentry tags to more easily debug idle client errors.
              last_query: err?.data?.lastQuery ?? undefined,
            },
          });
          Sentry.close().finally(() => process.exit(1));
        }

        logger.verbose(`Connecting to ${pgConfig.user}@${pgConfig.host}:${pgConfig.database}`);

        await sqldb.initAsync(pgConfig, idleErrorHandler);

        // Our named locks code maintains a separate pool of database connections.
        // This ensures that we avoid deadlocks.
        await namedLocks.init(pgConfig, idleErrorHandler, {
          renewIntervalMs: config.namedLocksRenewIntervalMs,
        });

        logger.verbose('Successfully connected to database');
      },
      async () => {
        if (argv['refresh-workspace-hosts-and-exit']) {
          logger.info('option --refresh-workspace-hosts specified, refreshing workspace hosts');

          const hosts = await markAllWorkspaceHostsUnhealthy();

          const pluralHosts = hosts.length === 1 ? 'host' : 'hosts';
          logger.info(`${hosts.length} ${pluralHosts} marked unhealthy`);
          hosts.forEach((host) => logger.info(`- ${host.instance_id} (${host.hostname})`));

          process.exit(0);
        }
      },
      async () => {
        // We need to do this before we run migrations, as some migrations will
        // call `enqueueBatchedMigration` which requires this to be initialized.
        const runner = initBatchedMigrations({
          project: 'prairielearn',
          directories: [path.join(__dirname, 'batched-migrations')],
        });

        runner.on('error', (err) => {
          logger.error('Batched migration runner error', err);
          Sentry.captureException(err);
        });
      },
      async () => {
        // Using the `--migrate-and-exit` flag will override the value of
        // `config.runMigrations`. This allows us to use the same config when
        // running migrations as we do when we start the server.
        if (config.runMigrations || argv['migrate-and-exit']) {
          await migrations.init(
            [path.join(__dirname, 'migrations'), SCHEMA_MIGRATIONS_PATH],
            'prairielearn',
          );

          if (argv['migrate-and-exit']) {
            logger.info('option --migrate-and-exit passed, running DB setup and exiting');
            process.exit(0);
          }
        }
      },
      async () => {
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
            {
              valueType: opentelemetry.ValueType.INT,
              interval: 1000,
            },
            () => pool.totalCount,
          );

          opentelemetry.createObservableValueGauges(
            meter,
            `postgres.pool.${name}.idle`,
            {
              valueType: opentelemetry.ValueType.INT,
              interval: 1000,
            },
            () => pool.idleCount,
          );

          opentelemetry.createObservableValueGauges(
            meter,
            `postgres.pool.${name}.waiting`,
            {
              valueType: opentelemetry.ValueType.INT,
              interval: 1000,
            },
            () => pool.waitingCount,
          );

          const queryCounter = opentelemetry.getObservableCounter(
            meter,
            `postgres.pool.${name}.query.count`,
            {
              valueType: opentelemetry.ValueType.INT,
            },
          );
          queryCounter.addCallback((observableResult) => {
            observableResult.observe(pool.queryCount);
          });
        });
      },
      async () => {
        if (config.runBatchedMigrations) {
          // Now that all migrations have been run, we can start executing any
          // batched migrations that may have been enqueued by migrations.
          startBatchedMigrations({
            workDurationMs: config.batchedMigrationsWorkDurationMs,
            sleepDurationMs: config.batchedMigrationsSleepDurationMs,
          });
        }
      },
      async () => {
        // We create and activate a random DB schema name
        // (https://www.postgresql.org/docs/12/ddl-schemas.html)
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
      },
      async () => {
        if ('sync-course' in argv) {
          logger.info(`option --sync-course passed, syncing course ${argv['sync-course']}...`);
          const { jobSequenceId, jobPromise } = await pullAndUpdateCourse({
            courseId: argv['sync-course'],
            authnUserId: null,
            userId: null,
          });
          logger.info(`Course sync job sequence ${jobSequenceId} created.`);
          logger.info(`Waiting for job to finish...`);
          await jobPromise;
          (await selectJobsByJobSequenceId(jobSequenceId)).forEach((job) => {
            logger.info(`Job ${job.id} finished with status '${job.status}'.\n${job.output}`);
          });
          process.exit(0);
        }
      },
      async () => {
        if (!config.initNewsItems) return;

        // We initialize news items asynchronously so that servers can boot up
        // in production as quickly as possible.
        news_items.initInBackground({
          // Always notify in production environments.
          notifyIfPreviouslyEmpty: !config.devMode,
        });
      },
      // We need to initialize these first, as the code callers require these
      // to be set up.
      function (callback) {
        load.initEstimator('request', 1);
        load.initEstimator('authed_request', 1);
        load.initEstimator('python', 1, false);
        load.initEstimator('python_worker_active', 1);
        load.initEstimator('python_worker_idle', 1, false);
        load.initEstimator('python_callback_waiting', 1);
        callback(null);
      },
      async () => await codeCaller.init(),
      async () => await assets.init(),
      async () =>
        await cache.init({
          type: config.cacheType,
          keyPrefix: config.cacheKeyPrefix,
          redisUrl: config.redisUrl,
        }),
      async () => await freeformServer.init(),
      function (callback) {
        if (!config.devMode) return callback(null);
        module.exports.insertDevUser(function (err) {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      async () => {
        logger.verbose('Starting server...');
        await module.exports.startServer();
      },
      async () => socketServer.init(server),
      function (callback) {
        externalGradingSocket.init(function (err) {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      async () => externalGrader.init(),
      async () => workspace.init(),
      async () => serverJobs.init(),
      async () => nodeMetrics.init(),
      // These should be the last things to start before we actually start taking
      // requests, as they may actually end up executing course code.
      async () => {
        if (!config.externalGradingEnableResults) return;
        await externalGraderResults.init();
      },
      async () => cron.init(),
      async () => lifecycleHooks.completeInstanceLaunch(),
    ],
    function (err, data) {
      if (err) {
        logger.error('Error initializing PrairieLearn server:', err, data);
        throw err;
      } else {
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
    },
  );
}
