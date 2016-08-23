var ERR = require('async-stacktrace');
var logger = require("./logger");
var error = require("./error");
var config = require("./config");
var db = require("./db");
var sqldb = require("./sqldb");

var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var favicon = require('serve-favicon');
var async = require("async");
var moment = require("moment-timezone");
var Promise = require('bluebird');

logger.infoOverride('PrairieLearn server start');

configFilename = 'config.json';
if (process.argv.length > 2) {
    configFilename = process.argv[2];
}

config.loadConfig(configFilename);

if (config.logFilename) {
    logger.addFileLogging(config.logFilename);
    logger.info('activated file logging: ' + config.logFilename);
}

var requireFrontend = require("./require-frontend");
var courseDB = require("./course-db");
var filePaths = require("./file-paths");
var hmacSha256 = require("crypto-js/hmac-sha256");
var gamma = require("gamma");
var numeric = require("numeric");
var csvStringify = require('csv').stringify;
var archiver = require('archiver');
var jStat = require("jStat").jStat;
var syncFromDisk = require('./sync/syncFromDisk');
var child_process = require("child_process");
var PrairieStats = requireFrontend("PrairieStats");
var PrairieModel = requireFrontend("PrairieModel");
var PrairieRole = requireFrontend("PrairieRole");
var PrairieGeom = requireFrontend("PrairieGeom");
var PLConfig = require(path.join(config.frontendDir, "config"));
var express = require("express");
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var https = require('https');
var app = express();

var SAMPLE_INTERVAL = 60 * 1000; // ms
var nSample = 0;

var STATS_INTERVAL = 10 * 60 * 1000; // ms

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(function(req, res, next) {

    // bypass auth for local file serving
    if (config.localFileserver) {
        if (req.path == "/"
            || req.path == "/index.html"
            || req.path == "/version.js"
            || req.path == "/config.js"
            || req.path == "/favicon.png"
            || req.path == "/favicon.ico"
            || /^\/require\//.test(req.path)
            || /^\/css\//.test(req.path)
            || /^\/text\//.test(req.path)
            || /^\/img\//.test(req.path)
            || /^\/MathJax\//.test(req.path)
           ) {
            next();
            return;
        }
    }

    // bypass auth for local /auth serving
    if (config.authType === 'none' && req.path == "/auth") {
        next();
        return;
    }
    
    // bypass auth for local /admin/ and /pl/ serving
    if (config.authType === 'none'
        && (/^\/admin/.test(req.path)
            || /^\/pl/.test(req.path)
            || /^\/images\//.test(req.path)
            || /^\/fonts\//.test(req.path)
            || /^\/javascripts\//.test(req.path)
            || /^\/localscripts\//.test(req.path)
            || /^\/stylesheets\//.test(req.path))) {
        req.authUID = 'user1@illinois.edu';
        req.authName = 'Test User';
        req.authRole = 'Superuser';
        req.mode = 'Public';
        req.userUID = 'user1@illinois.edu';
        req.userRole = 'Superuser';
        next();
        return;
    }
    
    // bypass auth for heartbeat
    if (req.path == "/heartbeat") {
        next();
        return;
    }

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }

    if (config.authType == 'eppn' || config.authType == 'x-auth' || config.authType === 'none') {
        var authUID = null, authName = null, authDate = null, authSignature = null, mode = null, userUID = null, userRole = null;
        if (req.cookies.userData) {
            var cookieUserData;
            try {
                cookieUserData = JSON.parse(req.cookies.userData);
            } catch (e) {
                return sendError(res, 403, "Error parsing cookies.userData as JSON", {userData: req.cookies.userData});
            }
            if (cookieUserData.authUID) authUID = cookieUserData.authUID;
            if (cookieUserData.authName) authName = cookieUserData.authName;
            if (cookieUserData.authDate) authDate = cookieUserData.authDate;
            if (cookieUserData.authSignature) authSignature = cookieUserData.authSignature;
            if (cookieUserData.mode) mode = cookieUserData.mode;
            if (cookieUserData.userUID) userUID = cookieUserData.userUID;
            if (cookieUserData.userRole) userRole = cookieUserData.userRole;
        }
        if (req.headers['x-auth-uid']) authUID = req.headers['x-auth-uid'];
        if (req.headers['x-auth-name']) authName = req.headers['x-auth-name'];
        if (req.headers['x-auth-date']) authDate = req.headers['x-auth-date'];
        if (req.headers['x-auth-signature']) authSignature = req.headers['x-auth-signature'];
        if (req.headers['x-mode']) mode = req.headers['x-mode'];
        if (req.headers['x-user-uid']) userUID = req.headers['x-user-uid'];
        if (req.headers['x-user-role']) userRole = req.headers['x-user-role'];

        if (!authUID) return next(error.make(403, "No X-Auth-UID header and no authUID cookie", {path: req.path}));
        if (!authName) return next(error.make(403, "No X-Auth-Name header and no authName cookie", {path: req.path}));
        if (!authDate) return next(error.make(403, "No X-Auth-Date header and no authDate cookie", {path: req.path}));
        if (!authSignature) return next(error.make(403, "No X-Auth-Signature header and no authSignature cookie", {path: req.path}));

        if (!mode) mode = 'Default';
        if (!userUID) userUID = authUID;

        authUID = authUID.toLowerCase();
        userUID = userUID.toLowerCase();

        var checkData = authUID + "/" + authName + "/" + authDate;
        var checkSignature = hmacSha256(checkData, config.secretKey).toString();
        if (authSignature !== checkSignature) return next(error.make(403, "Invalid X-Auth-Signature for " + authUID));

        // authorization succeeded, store data in the request
        req.authUID = authUID;
        req.authName = authName;
        req.authDate = authDate;
        req.authSignature = authSignature;
        req.mode = mode;
        req.userUID = userUID;
    } else {
        return next(error.make(500, "Invalid authType: " + config.authType));
    }

    var serverMode = 'Public';
    var clientIP = req.headers['x-forwarded-for'];
    if (!clientIP) {
        clientIP = req.ip;
    }
    if (_(clientIP).isString()) {
        var ipParts = clientIP.split('.');
        if (ipParts.length == 4) {
            try {
                n1 = parseInt(ipParts[0]);
                n2 = parseInt(ipParts[1]);
                n3 = parseInt(ipParts[2]);
                n4 = parseInt(ipParts[3]);
                // Grainger 57
                if (n1 == 192 && n2 == 17 && n3 == 180 && n4 >= 128 && n4 <= 255) {
                    serverMode = 'Exam';
                }
                if (moment.tz("2016-05-06T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
                    // DCL L520
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 36 && n4 <= 76) {
                        serverMode = 'Exam';
                    }
                }
                if (moment.tz("2016-05-09T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
                    // DCL L440
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 == 144) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 78 && n4 <= 106) {
                        serverMode = 'Exam';
                    }
                }
                if (courseDB.courseInfo.name == "CS 225") {
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 82 && n4 <= 117) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 206 && n4 <= 211) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 128 && n4 <= 130) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 == 179) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 == 60) {
                        serverMode = 'Exam';
                    }
                }
            } catch (e) {}
        }
    }
    req.mode = serverMode;
});

app.use(function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        var access = {
            timestamp: (new Date()).toISOString(),
            ip: req.ip,
            forwardedIP: req.headers['x-forwarded-for'],
            authUID: req.authUID,
            authRole: req.authRole,
            userUID: req.userUID,
            userRole: req.userRole,
            mode: req.mode,
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
        };
        logger.info("request", access);
    }
    next();
});

app.all('/*', function(req, res, next) {

    // enable CORS on all requests, see http://enable-cors.org/server_expressjs.html
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, PUT, PATCH, GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Accept, X-Auth-UID, X-Auth-Name, X-Auth-Date, X-Auth-Signature, Content-Type");

    // disable all caching for all requests
    res.header("Cache-Control", "max-age=0, no-cache, no-store, must-revalidate");

    next();
});

// needed for CORs pre-flight checks
app.options('/*', function(req, res) {
    res.json({});
});

// hack for development testing
if (config.authType === 'none') {
    app.get("/auth", function(req, res) {
        var authUID = "user1@illinois.edu";
        var authName = "Test User";
        var authDate = (new Date()).toISOString();
        var checkData = authUID + "/" + authName + "/" + authDate;
        var authSignature = hmacSha256(checkData, config.secretKey).toString();
        res.json(stripPrivateFields({
            "uid": authUID,
            "name": authName,
            "date": authDate,
            "signature": authSignature,
        }));
    });
}

// view engine setup
app.set('views', __dirname);
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// static serving of all subdirectories of "./public"
app.use(express.static(path.join(__dirname, 'public')));

/*
  Middleware handlers. For each route we do several things:
  1. Check authorization.
  2. Check that the implied nesting is true (e.g., that the test is inside the course).
  3. Store URL parameters and other information in the req.locals object for templates.
*/
app.use('/admin/', require('./middlewares/parsePostData'));
app.use('/admin/:courseInstanceId', require('./middlewares/checkAdminAuth'));
app.use('/admin/:courseInstanceId', require('./middlewares/currentCourseInstance'));
app.use('/admin/:courseInstanceId', require('./middlewares/currentEnrollment'));
app.use('/admin/:courseInstanceId', require('./middlewares/currentCourse'));
app.use('/admin/:courseInstanceId', require('./middlewares/adminUrlPrefix'));
app.use('/admin/:courseInstanceId', require('./middlewares/courseList'));
app.use('/admin/:courseInstanceId', require('./middlewares/courseInstanceList'));
app.use('/admin/:courseInstanceId/test/:testId', require('./middlewares/currentTest'));
app.use('/admin/:courseInstanceId/question/:questionId', require('./middlewares/currentQuestion'));

// Actual route handlers.
app.use('/admin', require('./pages/adminHome/adminHome'));
// redirect class page to tests page
app.use(function(req, res, next) {if (/\/admin\/[0-9]+\/?$/.test(req.url)) {req.url = req.url.replace(/\/?$/, '/tests');} next();});
app.use('/admin/:courseInstanceId/tests', require('./pages/adminTests/adminTests'));
app.use('/admin/:courseInstanceId/test/:testId', require('./pages/adminTest/adminTest'));
app.use('/admin/:courseInstanceId/users', require('./pages/adminUsers/adminUsers'));
app.use('/admin/:courseInstanceId/questions', require('./pages/adminQuestions/adminQuestions'));
app.use('/admin/:courseInstanceId/question/:questionId', require('./pages/adminQuestion/adminQuestion'));
app.use('/admin/:courseInstanceId/question/:questionId/file', require('./pages/questionFile/questionFile'));
app.use('/admin/:courseInstanceId/question/:questionId/text', require('./pages/questionText/questionText'));

// Middleware for user pages
app.use('/pl/', require('./middlewares/parsePostData'));
app.use('/pl/', require('./middlewares/ensureUser'));
app.use('/pl/', require('./middlewares/userCourseInstanceList'));
app.use('/pl/:courseInstanceId', require('./middlewares/ensureEnrollment'));
app.use('/pl/:courseInstanceId', require('./middlewares/currentCourseInstance'));
app.use('/pl/:courseInstanceId', require('./middlewares/currentCourse'));
app.use('/pl/:courseInstanceId', require('./middlewares/userUrlPrefix'));
app.use('/pl/:courseInstanceId/test/:testId', require('./middlewares/currentTest'));
app.use('/pl/:courseInstanceId/testInstance/:testInstanceId', require('./middlewares/currentTestInstance'));
app.use('/pl/:courseInstanceId/testInstance/:testInstanceId', require('./middlewares/currentTest'));
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId', require('./middlewares/currentInstanceQuestion'));
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId', require('./middlewares/currentTestInstance'));
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId', require('./middlewares/currentTest'));
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId', require('./middlewares/currentQuestion'));

// Route handlers for user pages
app.use('/pl', require('./pages/userHome/userHome'));
// redirect class page to tests page
app.use(function(req, res, next) {if (/\/pl\/[0-9]+\/?$/.test(req.url)) {req.url = req.url.replace(/\/?$/, '/tests');} next();});
app.use('/pl/:courseInstanceId/tests', require('./pages/userTests/userTests'));
app.use('/pl/:courseInstanceId/test/:testId', require('./pages/userTest/userTest'));
app.use('/pl/:courseInstanceId/testInstance/:testInstanceId', [
    // following handlers will call next() if they don't match the correct test type
    require('./pages/userTestInstanceHomework/userTestInstanceHomework'),
]);
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId', [
    // following handlers will call next() if they don't match the correct test type
    require('./pages/userInstanceQuestionHomework/userInstanceQuestionHomework'),
    //require('./pages/userInstanceQuestionExam/userInstanceQuestionExam'),
]);
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId/file', require('./pages/questionFile/questionFile'));
app.use('/pl/:courseInstanceId/instanceQuestion/:instanceQuestionId/text', require('./pages/questionText/questionText'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    err.data = {
        url: req.url,
        method: req.method,
        authUID: req.authUID,
        userUID: req.userUID,
        mode: req.mode
    };
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        logger.error("Error page", {msg: err.message, data: err.data, stack: err.stack});
        res.render('pages/error/error', {
            message: err.message,
            error: err,
            data: err.data,
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    logger.error("Error page", {msg: err.message, data: err.data, stack: err.stack});
    res.render('pages/error/error', {
        message: err.message,
        error: {}
    });
});

var loadAndInitCourseData = function(callback) {
    courseDB.load(function(err) {
        if (err) return callback(err);
        initTestData(callback);
    });
};

var syncTestsMongo = require('./sync/fromMongo/tests');
var syncUsers = require('./sync/fromMongo/users');
var syncTestInstances = require('./sync/fromMongo/testInstances');
var syncQuestionInstances = require('./sync/fromMongo/questionInstances');
var syncSubmissions = require('./sync/fromMongo/submissions');
var syncAccesses = require('./sync/fromMongo/accesses');
var syncQuestionViews = require('./sync/fromMongo/questionViews');

var syncMongoToSQL = function(callback) {
    logger.infoOverride("Starting sync of Mongo to SQL");
    async.series([
        function(callback) {logger.infoOverride("Syncing tests from Mongo to SQL DB"); callback(null);},
        syncTestsMongo.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing users from Mongo to SQL DB"); callback(null);},
        syncUsers.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing test instances from Mongo to SQL DB"); callback(null);},
        syncTestInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing question instances from Mongo to SQL DB"); callback(null);},
        syncQuestionInstances.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing submissions from Mongo to SQL DB"); callback(null);},
        syncSubmissions.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing accesses from Mongo to SQL DB"); callback(null);},
        syncAccesses.sync.bind(null, courseDB.courseInfo),
        function(callback) {logger.infoOverride("Syncing questionViews from Mongo to SQL DB"); callback(null);},
        syncQuestionViews.sync.bind(null, courseDB.courseInfo),
    ], function(err) {
        if (err) return callback(err);
        logger.infoOverride("Completed sync of Mongo to SQL");
        callback(null);
    });
};

var startServer = function(callback) {
    if (config.serverType === 'https') {
        var options = {
            key: fs.readFileSync('/etc/pki/tls/private/localhost.key'),
            cert: fs.readFileSync('/etc/pki/tls/certs/localhost.crt'),
            ca: [fs.readFileSync('/etc/pki/tls/certs/server-chain.crt')]
        };
        https.createServer(options, app).listen(config.serverPort);
        logger.info('server listening to HTTPS on port ' + config.serverPort);
        callback(null);
    } else if (config.serverType === 'http') {
        app.listen(config.serverPort);
        logger.info('server listening to HTTP on port ' + config.serverPort);
        callback(null);
    } else {
        callback('unknown serverType: ' + config.serverType);
    }
};

async.series([
    sqldb.init,
    startServer,
    // FIXME: we are short-circuiting this for development,
    // for prod these tasks should be back inline
    function(callback) {
        callback(null);
        async.eachSeries(config.courseDirs || [], function(courseDir, callback) {
            syncFromDisk.syncDiskToSql(courseDir, callback);
        }, function(err, data) {
            if (err) {
                logger.error("Error syncing SQL DB:", err, data);
            } else {
                logger.infoOverride("Completed sync SQL DB");
            }
        });

        /*        
        async.series([
            syncDiskToSQL,
            syncMongoToSQL,
        ], function(err, data) {
            if (err) {
                logger.error("Error syncing SQL DB:", err, data);
            }
        });
        */
    },
], function(err, data) {
    if (err) {
        logger.error("Error initializing PrairieLearn server:", err, data);
        logger.error("Exiting...");
        process.exit(1);
    } else {
        logger.infoOverride("PrairieLearn server ready");
    }
});

//module.exports = app;
