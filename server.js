const ERR = require('async-stacktrace');
const util = require('util');
const fs = require('fs');
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
const argv = require('yargs-parser') (process.argv.slice(2));
const multer = require('multer');
const filesize = require('filesize');
const url = require('url');
const { createProxyMiddleware } = require('http-proxy-middleware');

const logger = require('./lib/logger');
const config = require('./lib/config');
const load = require('./lib/load');
const awsHelper = require('./lib/aws.js');
const externalGrader = require('./lib/externalGrader');
const externalGraderResults = require('./lib/externalGraderResults');
const externalGradingSocket = require('./lib/externalGradingSocket');
const workspace = require('./lib/workspace');
const assessment = require('./lib/assessment');
const { sqldb, migrations } = require('@prairielearn/prairielib');
const sprocs = require('./sprocs');
const news_items = require('./news_items');
const cron = require('./cron');
const redis = require('./lib/redis');
const socketServer = require('./lib/socket-server');
const serverJobs = require('./lib/server-jobs');
const freeformServer = require('./question-servers/freeform.js');
const cache = require('./lib/cache');
const { LocalCache } = require('./lib/local-cache');
const workers = require('./lib/workers');
const assets = require('./lib/assets');


process.on('warning', e => console.warn(e)); // eslint-disable-line no-console

// If there is only one argument, legacy it into the config option
if (argv['_'].length == 1) {
    argv['config'] = argv['_'][0];
    argv['_'] = [];
}

if ('h' in argv || 'help' in argv) {
    var msg = `PrairieLearn command line options:
    -h, --help                          Display this help and exit
    --config <filename>
    <filename> and no other args        Load an alternative config filename
    --migrate-and-exit                  Run the DB initialization parts and exit
    --exit                              Run all the initialization and exit
`;

    console.log(msg); // eslint-disable-line no-console
    process.exit(0);
}

/**
 * Creates the express application and sets up all PrairieLearn routes.
 * @return {Express App} The express "app" object that was created.
 */
module.exports.initExpress = function() {
    const app = express();
    app.set('views', path.join(__dirname, 'pages'));
    app.set('view engine', 'ejs');
    app.set('trust proxy', config.trustProxy);
    config.devMode = (app.get('env') == 'development');

    // Set res.locals variables first, so they will be available on
    // all pages including the error page (which we could jump to at
    // any point.
    app.use((req, res, next) => {
        res.locals.asset_path = assets.assetPath;
        res.locals.node_modules_asset_path = assets.nodeModulesAssetPath;
        next();
    });
    app.use(function(req, res, next) {res.locals.config = config; next();});
    app.use(function(req, res, next) {config.setLocals(res.locals); next();});

    // browser detection - data format is https://lancedikson.github.io/bowser/docs/global.html#ParsedResult
    app.use(function(req, res, next) {
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
    config.fileUploadMaxBytesFormatted = filesize(config.fileUploadMaxBytes, {base: 10, round: 0});
    app.post('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/uploads', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/question/:question_id', upload.single('file'));
    app.post('/pl/course/:course_id/question/:question_id', upload.single('file'));
    app.post('/pl/course/:course_id/question/:question_id/file_view', upload.single('file'));
    app.post('/pl/course/:course_id/question/:question_id/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/settings', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/instance_admin/settings', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/course_admin/settings', upload.single('file'));
    app.post('/pl/course/:course_id/course_admin/settings', upload.single('file'));
    app.post('/pl/course/:course_id/course_admin/file_view', upload.single('file'));
    app.post('/pl/course/:course_id/course_admin/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/course_admin/file_view', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/course_admin/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view/*', upload.single('file'));
    app.post('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/groups', upload.single('file'));

    // proxy workspaces to remote machines
    let workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
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
                    const sql
                          = 'SELECT q.workspace_url_rewrite'
                          + ' FROM questions AS q'
                          + ' JOIN variants AS v ON (v.question_id = q.id)'
                          + ' WHERE v.workspace_id = $workspace_id;';
                    const result = await sqldb.queryOneRowAsync(sql, {workspace_id});
                    workspace_url_rewrite = result.rows[0].workspace_url_rewrite;
                    if (workspace_url_rewrite == null) workspace_url_rewrite = true;
                    workspaceUrlRewriteCache.set(workspace_id, workspace_url_rewrite);
                }
                debug(`pathRewrite: found workspace_url_rewrite=${workspace_url_rewrite} for workspace_id=${workspace_id}`);
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
        logProvider: _provider => logger,
        router: async (req) => {
            try {
                const match = req.url.match(/^\/pl\/workspace\/([0-9]+)\/container\//);
                if (!match) throw new Error(`Could not match URL: ${req.url}`);
                const workspace_id = match[1];
                const result = await sqldb.queryOneRowAsync(`SELECT hostname FROM workspaces WHERE id = $workspace_id;`, {workspace_id});
                const url = `http://${result.rows[0].hostname}/`;
                return url;
            } catch (err) {
                logger.error(`Error in router for url=${req.url}: ${err}`);
                return 'not-matched';
            }
        },
        onError: (err, req, res) => {
            logger.error(`Error proxying workspace request: ${err}`, {err, url: req.url});
            /* Check to make sure we weren't already in the middle of sending a response
               before replying with an error 500 */
            if (res && !res.headersSent) {
                if (res.status && res.send) {
                    res.status(500).send('Error proxying workspace request');
                }
            }
        },
    };
    const workspaceProxy = createProxyMiddleware((pathname) => {
        return pathname.match('/pl/workspace/([0-9])+/container/');
    }, workspaceProxyOptions);
    app.use('/pl/workspace/:workspace_id/container', [
        cookieParser(),
        require('./middlewares/date'),
        require('./middlewares/authn'),
        require('./middlewares/authzWorkspace'),
        workspaceProxy,
    ]);

    // Limit to 5MB of JSON
    app.use(bodyParser.json({limit: 5 * 1024 * 1024}));
    app.use(bodyParser.urlencoded({extended: false, limit: 5 * 1536 * 1024}));
    app.use(cookieParser());
    app.use(passport.initialize());
    if (config.devMode)
        app.use(favicon(path.join(__dirname, 'public', 'favicon-dev.ico')));
    else
        app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

    if ('localRootFilesDir' in config) {
        logger.info(`localRootFilesDir: Mapping ${config.localRootFilesDir} into /`);
        app.use(express.static(config.localRootFilesDir));
    }

    // To allow for more aggressive caching of static files served from public/,
    // we use an `assets/` path that includes a cachebuster in the path.
    // In requests for resources, the cachebuster will be a hash of the contents
    // of `/public`, which we will compute at startup. See `lib/assets.js` for
    // implementation details.
    app.use('/assets/:cachebuster', express.static(path.join(__dirname, 'public'), {
        // In dev mode, assets are likely to change while the server is running,
        // so we'll prevent them from being cached.
        maxAge: config.devMode ? '0' : '31557600',
        immutable: true,
    }));
    // This route is kept around for legacy reasons - new code should prefer the
    // "cacheable" route above.
    app.use(express.static(path.join(__dirname, 'public')));

    // To allow for more aggressive caching of files served from node_modules/,
    // we insert a hash of the module version into the resource path. This allows
    // us to treat those files as immutable and cache them essentially forever.
    app.use('/cacheable_node_modules/:cachebuster', express.static(path.join(__dirname, 'node_modules'), {
        maxAge: '31557600',
        immutable: true,
    }));
    // This is included for backwards-compatibility with pages that might still
    // expect to be able to load files from the `/node_modules` route.
    app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

    // Included for backwards-compatibility; new code should load MathJax from
    // `/cacheable_node_modules` instead.
    app.use('/MathJax', express.static(path.join(__dirname, 'node_modules', 'mathjax', 'es5')));

    // Support legacy use of ace by v2 questions
    app.use('/localscripts/calculationQuestion/ace', express.static(path.join(__dirname, 'node_modules/ace-builds/src-min-noconflict')));
    app.use('/javascripts/ace', express.static(path.join(__dirname, 'node_modules/ace-builds/src-min-noconflict')));

    // Middleware for all requests
    // response_id is logged on request, response, and error to link them together
    app.use(function(req, res, next) {res.locals.response_id = uuidv4(); next();});

    // load accounting for requests
    app.use(function(req, res, next) {load.startJob('request', res.locals.response_id); next();});
    app.use(function(req, res, next) {
        onFinished(res, function (err, res) {
            if (ERR(err, () => {})) logger.verbose('request on-response-finished error', {err, response_id: res.locals.response_id});
            load.endJob('request', res.locals.response_id);
        });
        next();
    });

    // More middlewares
    app.use(require('./middlewares/logResponse')); // defers to end of response
    app.use(require('./middlewares/cors'));
    app.use(require('./middlewares/date'));
    app.use('/pl/oauth2login', require('./pages/authLoginOAuth2/authLoginOAuth2'));
    app.use('/pl/oauth2callback', require('./pages/authCallbackOAuth2/authCallbackOAuth2'));
    app.use('/pl/shibcallback', require('./pages/authCallbackShib/authCallbackShib'));
    app.use('/pl/azure_login', require('./pages/authLoginAzure/authLoginAzure'));
    app.use('/pl/azure_callback', require('./pages/authCallbackAzure/authCallbackAzure'));
    app.use('/pl/lti', require('./pages/authCallbackLti/authCallbackLti'));
    app.use('/pl/login', require('./pages/authLogin/authLogin'));
    // disable SEB until we can fix the mcrypt issues
    // app.use('/pl/downloadSEBConfig', require('./pages/studentSEBConfig/studentSEBConfig'));
    app.use(require('./middlewares/authn')); // authentication, set res.locals.authn_user
    app.use('/pl/api', require('./middlewares/authnToken')); // authn for the API, set res.locals.authn_user
    app.use(require('./middlewares/csrfToken')); // sets and checks res.locals.__csrf_token
    app.use(require('./middlewares/logRequest'));

    // load accounting for authenticated accesses
    app.use(function(req, res, next) {load.startJob('authed_request', res.locals.response_id); next();});
    app.use(function(req, res, next) {
        onFinished(res, function (err, res) {
            if (ERR(err, () => {})) logger.verbose('authed_request on-response-finished error', {err, response_id: res.locals.response_id});
            load.endJob('authed_request', res.locals.response_id);
        });
        next();
    });

    // clear all cached course code in dev mode (no authorization needed)
    if (config.devMode) {
        app.use(require('./middlewares/undefCourseCode'));
    }

    // clear cookies on the homepage to reset any stale session state
    app.use(/^(\/?)$|^(\/pl\/?)$/, require('./middlewares/clearCookies'));

    // some pages don't need authorization
    app.use('/', [
      function(req, res, next) {res.locals.navPage = 'home'; next();},
      require('./pages/home/home'),
    ]);
    app.use('/pl', [
      function(req, res, next) {res.locals.navPage = 'home'; next();},
      require('./pages/home/home'),
    ]);
    app.use('/pl/settings', [
      function(req, res, next) {res.locals.navPage = 'user_settings'; next();},
      require('./pages/userSettings/userSettings'),
    ]);
    app.use('/pl/enroll', [
      function(req, res, next) {res.locals.navPage = 'enroll'; next();},
      require('./pages/enroll/enroll'),
    ]);
    app.use('/pl/logout', [
      function(req, res, next) {res.locals.navPage = 'logout'; next();},
      require('./pages/authLogout/authLogout'),
    ]);
    app.use('/pl/password', [
      function(req, res, next) {res.locals.navPage = 'password'; next();},
      require('./pages/authPassword/authPassword'),
    ]);
    app.use('/pl/news_items', [
      function(req, res, next) {res.locals.navPage = 'news'; next();},
      require('./pages/news_items/news_items.js'),
    ]);
    app.use('/pl/news_item', [
      function(req, res, next) {res.locals.navPage = 'news'; next();},
      function(req, res, next) {res.locals.navSubPage = 'news_item'; next();},
      require('./pages/news_item/news_item.js'),
    ]);
    app.use('/pl/request_course', [
        function(req, res, next) {res.locals.navPage = 'request_course'; next();},
        require('./pages/instructorRequestCourse/instructorRequestCourse.js'),
    ]);

    app.use('/pl/workspace/:workspace_id', [
        require('./middlewares/authzWorkspace'),
        require('./pages/workspace/workspace'),
    ]);
    // dev-mode pages are mounted for both out-of-course access (here) and within-course access (see below)
    if (config.devMode) {
        app.use('/pl/loadFromDisk', [
          function(req, res, next) {res.locals.navPage = 'load_from_disk'; next();},
          require('./pages/instructorLoadFromDisk/instructorLoadFromDisk'),
        ]);
        app.use('/pl/jobSequence', [
          function(req, res, next) {res.locals.navPage = 'job_sequence'; next();},
          require('./pages/instructorJobSequence/instructorJobSequence'),
        ]);
    }

    // all pages under /pl/course_instance require authorization
    app.use('/pl/course_instance/:course_instance_id', [
      function(req, res, next) {res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id; next();},
      function(req, res, next) {res.locals.navbarType = 'student'; next();},
      require('./middlewares/authzCourseInstance'),
      require('./middlewares/ansifySyncErrorsAndWarnings.js'),
    ]);

    // Redirect plain course page to Instructor or Student assessments page.
    // We have to do this after initial authz so we know whether we are an Instructor,
    // but before instructor authz so we still get a chance to enforce that.
    app.use(/^\/pl\/course_instance\/[0-9]+\/?$/, function(req, res, _next) {
        if (res.locals.authz_data.has_instructor_view) {
            res.redirect(res.locals.urlPrefix + '/instructor/instance_admin/assessments');
        } else {
            res.redirect(res.locals.urlPrefix + '/assessments');
        }
    });

    // Redirect Instructor effectiveUser page to the Student version if we don't have Instructor authz.
    // This is needed to handle the redirection after we change effective user to a student.
    app.use(/^\/pl\/course_instance\/[0-9]+\/instructor\/effectiveUser(\/?.*)$/, function(req, res, next) {
        if (!res.locals.authz_data.has_instructor_view) {
            res.redirect(res.locals.urlPrefix + '/effectiveUser');
        } else {
            next();
        }
    });

    // all pages under /pl/course_instance/*/instructor require instructor permissions
    app.use('/pl/course_instance/:course_instance_id/instructor', require('./middlewares/authzCourseInstanceHasInstructorView'));
    app.use('/pl/course_instance/:course_instance_id/instructor', function(req, res, next) {res.locals.urlPrefix = '/pl/course_instance/' + req.params.course_instance_id + '/instructor'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor', function(req, res, next) {res.locals.navbarType = 'instructor'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor', require('./middlewares/selectOpenIssueCount'));

    // all pages under /pl/course require authorization
    app.use('/pl/course/:course_id', require('./middlewares/authzCourse')); // set res.locals.course
    app.use('/pl/course/:course_id', require('./middlewares/ansifySyncErrorsAndWarnings.js'));
    app.use('/pl/course/:course_id', function(req, res, next) {res.locals.urlPrefix = '/pl/course/' + req.params.course_id; next();});
    app.use('/pl/course/:course_id', function(req, res, next) {res.locals.navbarType = 'instructor'; next();});
    app.use('/pl/course/:course_id', require('./middlewares/selectOpenIssueCount'));

    // Serve element statics
    app.use('/pl/static/elements', require('./pages/elementFiles/elementFiles'));
    app.use('/pl/course_instance/:course_instance_id/elements', require('./pages/elementFiles/elementFiles'));
    app.use('/pl/course_instance/:course_instance_id/instructor/elements', require('./pages/elementFiles/elementFiles'));
    app.use('/pl/course/:course_id/elements', require('./pages/elementFiles/elementFiles'));

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // API ///////////////////////////////////////////////////////////////

    app.use('/pl/api/v1', require('./api/v1'));

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Instructor pages //////////////////////////////////////////////////

    app.use('/pl/course_instance/:course_instance_id/instructor/effectiveUser', [
        require('./pages/instructorEffectiveUser/instructorEffectiveUser'),
    ]);

    // single assessment
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id', [
        require('./middlewares/selectAndAuthzAssessment'),
        require('./middlewares/ansifySyncErrorsAndWarnings.js'),
        require('./middlewares/selectAssessments'),
    ]);
    app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/assessment\/[0-9]+)\/?$/, (req, res, _next) => {
        res.redirect(`${req.params[0]}/questions`);
    });
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id', function(req, res, next) {res.locals.navPage = 'assessment'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorAssessmentSettings/instructorAssessmentSettings'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/questions', [
        function(req, res, next) {res.locals.navSubPage = 'questions'; next();},
        require('./pages/instructorAssessmentQuestions/instructorAssessmentQuestions'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/groups', [
        function(req, res, next) {res.locals.navSubPage = 'groups'; next();},
        require('./pages/instructorAssessmentGroups/instructorAssessmentGroups'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/access', [
        function(req, res, next) {res.locals.navSubPage = 'access'; next();},
        require('./pages/instructorAssessmentAccess/instructorAssessmentAccess'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/assessment_statistics', [
        function(req, res, next) {res.locals.navSubPage = 'assessment_statistics'; next();},
        require('./pages/instructorAssessmentStatistics/instructorAssessmentStatistics'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/question_statistics', [
        function(req, res, next) {res.locals.navSubPage = 'question_statistics'; next();},
        require('./pages/shared/assessmentStatDescriptions'),
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorAssessmentQuestionStatistics/instructorAssessmentQuestionStatistics'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/downloads', [
        function(req, res, next) {res.locals.navSubPage = 'downloads'; next();},
        require('./pages/instructorAssessmentDownloads/instructorAssessmentDownloads'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/uploads', [
        function(req, res, next) {res.locals.navSubPage = 'uploads'; next();},
        require('./pages/instructorAssessmentUploads/instructorAssessmentUploads'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/regrading', [
        function(req, res, next) {res.locals.navSubPage = 'regrading'; next();},
        require('./pages/instructorAssessmentRegrading/instructorAssessmentRegrading'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/manual_grading', [
        function(req, res, next) {res.locals.navSubPage = 'manual_grading'; next();},
        require('./pages/instructorAssessmentManualGrading/instructorAssessmentManualGrading'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/instances', [
        function(req, res, next) {res.locals.navSubPage = 'instances'; next();},
        require('./pages/instructorAssessmentInstances/instructorAssessmentInstances'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    app.use('/pl/course_instance/:course_instance_id/instructor/assessment_instance/:assessment_instance_id', [
        require('./middlewares/selectAndAuthzAssessmentInstance'),
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorAssessmentInstance/instructorAssessmentInstance'),
    ]);

    // single question
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./middlewares/ansifySyncErrorsAndWarnings.js'),
    ]);
    app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/question\/[0-9]+)\/?$/, (req, res, _next) => {
        // Redirect legacy question URLs to their preview page.
        // We need to maintain query parameters like `variant_id` so that the
        // preview page can render the correct variant.
        const newUrl = `${req.params[0]}/preview`;
        const newUrlParts = url.parse(newUrl);
        newUrlParts.query = req.query;
        res.redirect(url.format(newUrlParts));
    });
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id', function(req, res, next) {res.locals.navPage = 'question'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorQuestionSettings/instructorQuestionSettings'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/preview', [
        function(req, res, next) {res.locals.navSubPage = 'preview'; next();},
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorQuestionPreview/instructorQuestionPreview'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/statistics', [
        function(req, res, next) {res.locals.navSubPage = 'statistics'; next();},
        require('./pages/shared/assessmentStatDescriptions'),
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorQuestionStatistics/instructorQuestionStatistics'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    app.use('/pl/course_instance/:course_instance_id/instructor/grading_job', require('./pages/instructorGradingJob/instructorGradingJob'));
    app.use('/pl/course_instance/:course_instance_id/instructor/jobSequence', require('./pages/instructorJobSequence/instructorJobSequence'));
    app.use('/pl/course_instance/:course_instance_id/instructor/loadFromDisk', require('./pages/instructorLoadFromDisk/instructorLoadFromDisk'));
    app.use('/pl/course_instance/:course_instance_id/instructor/edit_error', require('./pages/editError/editError'));

    // course instance - news_items
    app.use('/pl/course_instance/:course_instance_id/instructor/news_items', require('./pages/news_items/news_items.js'));
    app.use('/pl/course_instance/:course_instance_id/instructor/news_item', require('./pages/news_item/news_item.js'));

    // course instance - course admin pages
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin', [
        require('./middlewares/authzCourseInstanceHasCourseView'),
    ]);
    app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/course_admin)\/?$/, (req, res, _next) => {
        res.redirect(`${req.params[0]}/instances`);
    });
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin', function(req, res, next) {res.locals.navPage = 'course_admin'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/access', [
        function(req, res, next) {res.locals.navSubPage = 'access'; next();},
        require('./pages/instructorCourseAdminAccess/instructorCourseAdminAccess'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/sets', [
        function(req, res, next) {res.locals.navSubPage = 'sets'; next();},
        require('./pages/instructorCourseAdminSets/instructorCourseAdminSets'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/instances', [
        function(req, res, next) {res.locals.navSubPage = 'instances'; next();},
        require('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/issues', [
        function(req, res, next) {res.locals.navSubPage = 'issues'; next();},
        require('./pages/instructorIssues/instructorIssues'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/questions', [
        function(req, res, next) {res.locals.navSubPage = 'questions'; next();},
        require('./pages/instructorQuestions/instructorQuestions'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/syncs', [
        function(req, res, next) {res.locals.navSubPage = 'syncs'; next();},
        require('./pages/courseSyncs/courseSyncs'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/topics', [
        function(req, res, next) {res.locals.navSubPage = 'topics'; next();},
        require('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/tags', [
        function(req, res, next) {res.locals.navSubPage = 'tags'; next();},
        require('./pages/instructorCourseAdminTags/instructorCourseAdminTags'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/grading', [
        function(req, res, next) {res.locals.navSubPage = 'grading'; next();},
        require('./pages/instructorCourseAdminGrading/instructorCourseAdminGrading'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/course_admin/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    // course instance - instance admin pages
    app.use(/^(\/pl\/course_instance\/[0-9]+\/instructor\/instance_admin)\/?$/, (req, res, _next) => {
        res.redirect(`${req.params[0]}/assessments`);
    });
    app.use('/pl/course_instance/:course_instance_id/instructor', function(req, res, next) {res.locals.navbarType = 'instructor'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin', function(req, res, next) {res.locals.navPage = 'instance_admin'; next();});
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorInstanceAdminSettings/instructorInstanceAdminSettings'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/access', [
        function(req, res, next) {res.locals.navSubPage = 'access'; next();},
        require('./pages/instructorInstanceAdminAccess/instructorInstanceAdminAccess'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/assessments', [
        function(req, res, next) {res.locals.navSubPage = 'assessments'; next();},
        require('./pages/instructorAssessments/instructorAssessments'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/gradebook', [
        function(req, res, next) {res.locals.navSubPage = 'gradebook'; next();},
        require('./pages/instructorGradebook/instructorGradebook'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/lti', [
        function(req, res, next) {res.locals.navSubPage = 'lti'; next();},
        require('./pages/instructorInstanceAdminLti/instructorInstanceAdminLti'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_admin/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    // clientFiles
    app.use('/pl/course_instance/:course_instance_id/instructor/clientFilesCourse', require('./pages/clientFilesCourse/clientFilesCourse'));
    app.use('/pl/course_instance/:course_instance_id/instructor/clientFilesCourseInstance', require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'));
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/clientFilesAssessment', [
        require('./middlewares/selectAndAuthzAssessment'),
        require('./pages/clientFilesAssessment/clientFilesAssessment'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/clientFilesQuestion', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/clientFilesQuestion/clientFilesQuestion'),
    ]);

    // generatedFiles
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/generatedFilesQuestion', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/instructorGeneratedFilesQuestion/instructorGeneratedFilesQuestion'),
    ]);

    // legacy client file paths
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/file', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/legacyQuestionFile/legacyQuestionFile'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/question/:question_id/text', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/legacyQuestionText/legacyQuestionText'),
    ]);

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Student pages /////////////////////////////////////////////////////

    // Exam/Homeworks student routes are polymorphic - they have multiple handlers, each of
    // which checks the assessment type and calls next() if it's not the right type
    app.use('/pl/course_instance/:course_instance_id/gradebook', [
        function(req, res, next) {res.locals.navSubPage = 'gradebook'; next();},
        require('./middlewares/logPageView')('studentGradebook'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentGradebook/studentGradebook'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessments', [
        function(req, res, next) {res.locals.navSubPage = 'assessments'; next();},
        require('./middlewares/logPageView')('studentAssessments'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentAssessments/studentAssessments'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessment/:assessment_id', [
        require('./middlewares/selectAndAuthzAssessment'),
        require('./middlewares/logPageView')('studentAssessment'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentAssessmentHomework/studentAssessmentHomework'),
        require('./pages/studentAssessmentExam/studentAssessmentExam'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/file', [
        require('./middlewares/selectAndAuthzAssessmentInstance'),
        require('./middlewares/logPageView')('studentAssessmentInstanceFile'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentAssessmentInstanceFile/studentAssessmentInstanceFile'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id/time_remaining', [
        require('./middlewares/selectAndAuthzAssessmentInstance'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentAssessmentInstanceTimeRemaining/studentAssessmentInstanceTimeRemaining'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessment_instance/:assessment_instance_id', [
        require('./middlewares/selectAndAuthzAssessmentInstance'),
        require('./middlewares/logPageView')('studentAssessmentInstance'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentAssessmentInstanceHomework/studentAssessmentInstanceHomework'),
        require('./pages/studentAssessmentInstanceExam/studentAssessmentInstanceExam'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/assessment_question/:assessment_question_id/next_ungraded', [
        function(req, res, next) {res.locals.assessment_question_id = req.params.assessment_question_id; next();},
        require('./pages/instructorQuestionManualGrading/instructorQuestionManualGradingNextInstanceQuestion'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/assessment_question/:assessment_question_id/manual_grading', [
        function(req, res, next) {res.locals.navSubPage = 'manual_grading'; next();},
        function(req, res, next) {res.locals.assessment_question_id = req.params.assessment_question_id; next();},
        require('./pages/instructorAssessmentQuestionManualGrading/instructorAssessmentQuestionManualGrading'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instructor/instance_question/:instance_question_id/manual_grading', [
        function(req, res, next) {res.locals.navSubPage = 'manual_grading'; next();},
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        require('./pages/instructorQuestionManualGrading/instructorQuestionManualGrading'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id', [
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        // don't use logPageView here, we load it inside the page so it can get the variant_id
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentInstanceQuestionHomework/studentInstanceQuestionHomework'),
        require('./pages/studentInstanceQuestionExam/studentInstanceQuestionExam'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/report_cheating', [
      function(req, res, next) {res.locals.navSubPage = 'report_cheating'; next();},
      require('./pages/studentReportCheating/studentReportCheating'),
    ]);
    if (config.devMode) {
        app.use('/pl/course_instance/:course_instance_id/loadFromDisk', require('./pages/instructorLoadFromDisk/instructorLoadFromDisk'));
        app.use('/pl/course_instance/:course_instance_id/jobSequence', require('./middlewares/authzCourseInstanceAuthnHasInstructorView'));
        app.use('/pl/course_instance/:course_instance_id/jobSequence', require('./pages/instructorJobSequence/instructorJobSequence'));
    }

    // Serve extension statics
    app.use('/pl/course_instance/:course_instance_id/elementExtensions', require('./pages/elementExtensionFiles/elementExtensionFiles'));
    app.use('/pl/course_instance/:course_instance_id/instructor/elementExtensions', require('./pages/elementExtensionFiles/elementExtensionFiles'));
    app.use('/pl/course/:course_id/elementExtensions', require('./pages/elementExtensionFiles/elementExtensionFiles'));

    // student - news_items
    app.use('/pl/course_instance/:course_instance_id/news_items', require('./pages/news_items/news_items.js'));
    app.use('/pl/course_instance/:course_instance_id/news_item', require('./pages/news_item/news_item.js'));


    // Allow access to effectiveUser as a Student page, but only for users have authn (not authz) as Instructor
    app.use('/pl/course_instance/:course_instance_id/effectiveUser', require('./middlewares/authzCourseInstanceAuthnHasInstructorView'));
    app.use('/pl/course_instance/:course_instance_id/effectiveUser', require('./pages/instructorEffectiveUser/instructorEffectiveUser'));

    // clientFiles
    app.use('/pl/course_instance/:course_instance_id/clientFilesCourse', [
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/clientFilesCourse/clientFilesCourse'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/clientFilesCourseInstance', [
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/clientFilesCourseInstance/clientFilesCourseInstance'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/assessment/:assessment_id/clientFilesAssessment', [
        require('./middlewares/selectAndAuthzAssessment'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/clientFilesAssessment/clientFilesAssessment'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/clientFilesQuestion', [
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/clientFilesQuestion/clientFilesQuestion'),
    ]);

    // generatedFiles
    app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/generatedFilesQuestion', [
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/studentGeneratedFilesQuestion/studentGeneratedFilesQuestion'),
    ]);

    // legacy client file paths
    app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/file', [
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/legacyQuestionFile/legacyQuestionFile'),
    ]);
    app.use('/pl/course_instance/:course_instance_id/instance_question/:instance_question_id/text', [
        require('./middlewares/selectAndAuthzInstanceQuestion'),
        require('./middlewares/studentAssessmentAccess'),
        require('./pages/legacyQuestionText/legacyQuestionText'),
    ]);

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Course pages //////////////////////////////////////////////////////

    app.use(/^\/pl\/course\/[0-9]+\/?$/, function(req, res, _next) {res.redirect(res.locals.urlPrefix + '/course_admin');}); // redirect plain course URL to overview page

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
    app.use('/pl/course/:course_id/question/:question_id', function(req, res, next) {res.locals.navPage = 'question'; next();});
    app.use('/pl/course/:course_id/question/:question_id/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorQuestionSettings/instructorQuestionSettings'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/preview', [
        function(req, res, next) {res.locals.navSubPage = 'preview'; next();},
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorQuestionPreview/instructorQuestionPreview'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/statistics', [
        function(req, res, next) {res.locals.navSubPage = 'statistics'; next();},
        require('./pages/shared/assessmentStatDescriptions'),
        require('./pages/shared/floatFormatters'),
        require('./pages/instructorQuestionStatistics/instructorQuestionStatistics'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    // course - news_items
    app.use('/pl/course/:course_id/news_items', require('./pages/news_items/news_items.js'));
    app.use('/pl/course/:course_id/news_item', require('./pages/news_item/news_item.js'));

    app.use('/pl/course/:course_id/file_transfer', [
        require('./pages/instructorFileTransfer/instructorFileTransfer'),
    ]);

    app.use('/pl/course/:course_id/edit_error', require('./pages/editError/editError'));

    app.use(/^(\/pl\/course\/[0-9]+\/course_admin)\/?$/, (req, res, _next) => {
        res.redirect(`${req.params[0]}/instances`);
    });
    app.use('/pl/course/:course_id/course_admin', function(req, res, next) {res.locals.navPage = 'course_admin'; next();});
    app.use('/pl/course/:course_id/course_admin/settings', [
        function(req, res, next) {res.locals.navSubPage = 'settings'; next();},
        require('./pages/instructorCourseAdminSettings/instructorCourseAdminSettings'),
    ]);
    app.use('/pl/course/:course_id/course_admin/access', [
        function(req, res, next) {res.locals.navSubPage = 'access'; next();},
        require('./pages/instructorCourseAdminAccess/instructorCourseAdminAccess'),
    ]);
    app.use('/pl/course/:course_id/course_admin/sets', [
        function(req, res, next) {res.locals.navSubPage = 'sets'; next();},
        require('./pages/instructorCourseAdminSets/instructorCourseAdminSets'),
    ]);
    app.use('/pl/course/:course_id/course_admin/instances', [
        function(req, res, next) {res.locals.navSubPage = 'instances'; next();},
        require('./pages/instructorCourseAdminInstances/instructorCourseAdminInstances'),
    ]);
    app.use('/pl/course/:course_id/course_admin/issues', [
        function(req, res, next) {res.locals.navSubPage = 'issues'; next();},
        require('./pages/instructorIssues/instructorIssues'),
    ]);
    app.use('/pl/course/:course_id/course_admin/questions', [
        function(req, res, next) {res.locals.navSubPage = 'questions'; next();},
        require('./pages/instructorQuestions/instructorQuestions'),
    ]);
    app.use('/pl/course/:course_id/course_admin/syncs', [
        function(req, res, next) {res.locals.navSubPage = 'syncs'; next();},
        require('./pages/courseSyncs/courseSyncs'),
    ]);
    app.use('/pl/course/:course_id/course_admin/topics', [
        function(req, res, next) {res.locals.navSubPage = 'topics'; next();},
        require('./pages/instructorCourseAdminTopics/instructorCourseAdminTopics'),
    ]);
    app.use('/pl/course/:course_id/course_admin/tags', [
        function(req, res, next) {res.locals.navSubPage = 'tags'; next();},
        require('./pages/instructorCourseAdminTags/instructorCourseAdminTags'),
    ]);
    app.use('/pl/course/:course_id/course_admin/grading', [
        function(req, res, next) {res.locals.navSubPage = 'grading'; next();},
        require('./pages/instructorCourseAdminGrading/instructorCourseAdminGrading'),
    ]);
    app.use('/pl/course/:course_id/course_admin/file_edit', [
        function(req, res, next) {res.locals.navSubPage = 'file_edit'; next();},
        require('./pages/instructorFileEditor/instructorFileEditor'),
    ]);
    app.use('/pl/course/:course_id/course_admin/file_view', [
        function(req, res, next) {res.locals.navSubPage = 'file_view'; next();},
        require('./pages/instructorFileBrowser/instructorFileBrowser'),
    ]);
    app.use('/pl/course/:course_id/course_admin/file_download', require('./pages/instructorFileDownload/instructorFileDownload'));

    app.use('/pl/course/:course_id/loadFromDisk', require('./pages/instructorLoadFromDisk/instructorLoadFromDisk'));
    app.use('/pl/course/:course_id/jobSequence', require('./pages/instructorJobSequence/instructorJobSequence'));

    // clientFiles
    app.use('/pl/course/:course_id/clientFilesCourse', require('./pages/clientFilesCourse/clientFilesCourse'));
    app.use('/pl/course/:course_id/question/:question_id/clientFilesQuestion', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/clientFilesQuestion/clientFilesQuestion'),
    ]);

    // generatedFiles
    app.use('/pl/course/:course_id/question/:question_id/generatedFilesQuestion', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/instructorGeneratedFilesQuestion/instructorGeneratedFilesQuestion'),
    ]);

    // legacy client file paths
    app.use('/pl/course/:course_id/question/:question_id/file', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/legacyQuestionFile/legacyQuestionFile'),
    ]);
    app.use('/pl/course/:course_id/question/:question_id/text', [
        require('./middlewares/selectAndAuthzInstructorQuestion'),
        require('./pages/legacyQuestionText/legacyQuestionText'),
    ]);

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Administrator pages ///////////////////////////////////////////////

    app.use('/pl/administrator', require('./middlewares/authzIsAdministrator'));
    app.use('/pl/administrator/overview', require('./pages/administratorOverview/administratorOverview'));
    app.use('/pl/administrator/queries', require('./pages/administratorQueries/administratorQueries'));
    app.use('/pl/administrator/query', require('./pages/administratorQuery/administratorQuery'));
    app.use('/pl/administrator/jobSequence/', require('./pages/administratorJobSequence/administratorJobSequence'));
    app.use('/pl/administrator/courseRequests/', require('./pages/administratorCourseRequests/administratorCourseRequests'));

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Webhooks //////////////////////////////////////////////////////////
    app.get('/pl/webhooks/ping', function(req, res, _next) {res.send('.');});
    app.use('/pl/webhooks/grading', require('./webhooks/grading/grading'));

    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////
    // Error handling ////////////////////////////////////////////////////

    // if no earlier routes matched, this will match and generate a 404 error
    app.use([
      require('./middlewares/notFound'),
      require('./pages/error/error'),
    ]);

    return app;
};

//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
// Server startup ////////////////////////////////////////////////////

var server;

module.exports.startServerAsync = async () => {
    const app = module.exports.initExpress();

    if (config.serverType === 'https') {
        const key = await (fs.promises.readFile(config.sslKeyFile));
        const cert = await (fs.promises.readFile(config.sslCertificateFile));
        const ca = [await (fs.promises.readFile(config.sslCAFile))];
        var options = {key, cert, ca};
        server = https.createServer(options, app);
        server.listen(config.serverPort);
        server.timeout = 600000; // 10 minutes
        logger.verbose('server listening to HTTPS on port ' + config.serverPort);
    } else if (config.serverType === 'http') {
        server = http.createServer(app);
        server.listen(config.serverPort);
        server.timeout = 600000; // 10 minutes
        logger.verbose('server listening to HTTP on port ' + config.serverPort);
    } else {
        throw new Error('unknown serverType: ' + config.serverType);
    }

    return app;
};
module.exports.startServer = util.callbackify(module.exports.startServerAsync);

module.exports.stopServer = function(callback) {
    if (!server) return callback(new Error('cannot stop an undefined server'));
    server.close(function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.insertDevUser = function(callback) {
    // add dev user as Administrator
    var sql
        = 'INSERT INTO users (uid, name)'
        + ' VALUES (\'dev@illinois.edu\', \'Dev User\')'
        + ' ON CONFLICT (uid) DO UPDATE'
        + ' SET name = EXCLUDED.name'
        + ' RETURNING user_id;';
    sqldb.queryOneRow(sql, [], function(err, result) {
        if (ERR(err, callback)) return;
        var user_id = result.rows[0].user_id;
        var sql
            = 'INSERT INTO administrators (user_id)'
            + ' VALUES ($user_id)'
            + ' ON CONFLICT (user_id) DO NOTHING;';
        var params = {user_id};
        sqldb.query(sql, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};

if (config.startServer) {
    async.series([
        async () => {
            logger.verbose('PrairieLearn server start');

            let configFilename = 'config.json';
            if ('config' in argv) {
                configFilename = argv['config'];
            }

            /* Load config values from AWS as early as possible so we can use them
               to set values for e.g. the database connection */
            await config.loadConfigAsync(configFilename);
            await awsHelper.init();
            await awsHelper.loadConfigSecrets();

            if (config.logFilename) {
                logger.addFileLogging(config.logFilename);
                logger.verbose('activated file logging: ' + config.logFilename);
            }
        },
        async () => {
            if (config.blockedAtWarnEnable) {
                blockedAt((time, stack) => {
                    const msg = `BLOCKED-AT: Blocked for ${time}ms`;
                    logger.verbose(msg, {time, stack});
                    console.log(msg + '\n' + stack.join('\n')); // eslint-disable-line no-console
                }, {threshold: config.blockedWarnThresholdMS}); // threshold in milliseconds
            } else if (config.blockedWarnEnable) {
                blocked((time) => {
                    const msg = `BLOCKED: Blocked for ${time}ms (set config.blockedAtWarnEnable for stack trace)`;
                    logger.verbose(msg, {time});
                    console.log(msg); // eslint-disable-line no-console
                }, {threshold: config.blockedWarnThresholdMS}); // threshold in milliseconds
            }
        },
        async () => {
            if (!config.hasAzure) return;

            let OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
            const azureConfig = {
                identityMetadata: config.azureIdentityMetadata,
                clientID: config.azureClientID,
                responseType: config.azureResponseType,
                responseMode: config.azureResponseMode,
                redirectUrl: config.azureRedirectUrl,
                allowHttpForRedirectUrl: config.azureAllowHttpForRedirectUrl,
                clientSecret: config.azureClientSecret,
                validateIssuer: config.azureValidateIssuer,
                isB2C: config.azureIsB2C,
                issuer: config.azureIssuer,
                passReqToCallback: config.azurePassReqToCallback,
                scope: config.azureScope,
                loggingLevel: config.azureLoggingLevel,
                nonceLifetime: config.azureNonceLifetime,
                nonceMaxAmount: config.azureNonceMaxAmount,
                useCookieInsteadOfSession: config.azureUseCookieInsteadOfSession,
                cookieEncryptionKeys: config.azureCookieEncryptionKeys,
                clockSkew: config.azureClockSkew,
            };
            passport.use(new OIDCStrategy(azureConfig, function(iss, sub, profile, accessToken, refreshToken, done) {return done(null, profile);}));
        },
        function(callback) {
            var pgConfig = {
                user: config.postgresqlUser,
                database: config.postgresqlDatabase,
                host: config.postgresqlHost,
                password: config.postgresqlPassword,
                max: 100,
                idleTimeoutMillis: 30000,
            };
            logger.verbose('Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database);
            var idleErrorHandler = function(err) {
                logger.error('idle client error', err);
                // https://github.com/PrairieLearn/PrairieLearn/issues/2396
                process.exit(1);
            };
            sqldb.init(pgConfig, idleErrorHandler, function(err) {
                if (ERR(err, callback)) return;
                logger.verbose('Successfully connected to database');
                callback(null);
            });
        },
        function(callback) {
            migrations.init(path.join(__dirname, 'migrations'), 'prairielearn', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            sprocs.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if ('migrate-and-exit' in argv && argv['migrate-and-exit']) {
                logger.info('option --migrate-and-exit passed, running DB setup and exiting');
                process.exit(0);
            } else {
                callback(null);
            }
        },
        function(callback) {
            const notify_with_new_server = false;
            news_items.init(notify_with_new_server, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            cron.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            redis.init((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            cache.init((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            externalGrader.init(assessment, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            if (!config.externalGradingEnableResults) return callback(null);
            externalGraderResults.init((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        async () => await assets.init(),
        function(callback) {
            load.initEstimator('request', 1);
            load.initEstimator('authed_request', 1);
            load.initEstimator('python', 1, false);
            load.initEstimator('python_worker_active', 1);
            load.initEstimator('python_worker_idle', 1, false);
            load.initEstimator('python_callback_waiting', 1);
            callback(null);
        },
        function(callback) {
            workers.init();
            callback(null);
        },
        async () => {
            logger.verbose('Starting server...');
            await module.exports.startServerAsync();
        },
        function(callback) {
            if (!config.devMode) return callback(null);
            module.exports.insertDevUser(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            socketServer.init(server, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            externalGradingSocket.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            util.callbackify(workspace.init)(err => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            serverJobs.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            freeformServer.init(function(err) {
              if (ERR(err, callback)) return;
              callback(null);
          });
        },
    ], function(err, data) {
        if (err) {
            logger.error('Error initializing PrairieLearn server:', err, data);
            logger.error('Exiting...');
            process.exit(1);
        } else {
            logger.info('PrairieLearn server ready, press Control-C to quit');
            if (config.devMode) {
                logger.info('Go to ' + config.serverType + '://localhost:' + config.serverPort);
            }
            if ('exit' in argv) { logger.info('exit option passed, quitting...'); process.exit(0); }
        }
    });
}
