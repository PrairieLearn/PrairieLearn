var logger = require("./logger");
var config = require("./config");
var db = require("./db");

var _ = require("underscore");
var fs = require("fs");
var path = require("path");
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

var initTestData = function(callback) {
    async.each(_(courseDB.testDB).values(), function(item, cb) {
        db.tCollect.findOne({tid: item.tid}, function(err, obj) {
            if (err) {
                logger.error("error accessing tCollect for tid: " + item.tid, err);
                cb(err);
                return;
            }
            if (obj) {
                delete obj._id;
            } else {
                obj = {};
            }
            loadTestServer(item.tid, function(server) {
                var options = {
                    timezone: config.timezone,
                };
                var defaultOptions = server.getDefaultOptions();
                _(options).extend(defaultOptions, item.options);
                item.options = options;
                server.updateTest(obj, item.options);
                _(obj).extend(item);
                if (_(obj).has('qids')) {
                    _(obj.qids).each(function(qid) {
                        if (!_(courseDB.questionDB).has(qid)) {
                            logger.error('Test ' + obj.tid + ' contains invalid QID: ' + qid);
                        }
                    });
                }
                db.tCollect.update({tid: item.tid}, obj, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing to tCollect", {tid: item.tid, err: err});
                        cb(err);
                        return;
                    }
                    cb(null);
                });
            });
        });
    }, function(err) {
        if (err) {
            logger.error("Error initializing test data", err);
            callback(err);
            return;
        }
        logger.info("successfully initialized test data");
        callback(null);
    });
};

var logRequest = function() {
    nSample += 1;
};

var monitor = function() {
    var requestsPerSecond = nSample / SAMPLE_INTERVAL * 1000;
    logger.info("request rate", {
        sampleInterval: SAMPLE_INTERVAL,
        numberOfSamples: nSample,
        requestsPerSecond: requestsPerSecond
    });
    nSample = 0;
};

var sendError = function(res, code, msg, err) {
    if (err instanceof Error)
        err = String(err);
    logger.error("returning error", {code: code, msg: msg, err: err});
    if (res._header) {
        // response was already sent
        logger.error("response was already send, bailing out early");
        return;
    }
    var fullMsg = msg;
    try {
        fullMsg += ', err: ' + String(err);
    } catch (e) {};
    res.status(code).send(fullMsg);
};

var isDateBeforeNow = function(dateString) {
    return moment.tz(dateString, config.timezone).isBefore(); // isBefore() uses NOW with no arg
};

var isDateAfterNow = function(dateString) {
    return moment.tz(dateString, config.timezone).isAfter(); // isBefore() uses NOW with no arg
};

var checkTestAccessRule = function(req, tid, accessRule) {
    var resultRule = _(accessRule).clone();
    _(resultRule).defaults({
        availMode: true,
        availIdentity: true,
        availDate: true,
        availDefault: true,
        expired: false,
        credit: 0,
        startDate: null,
        endDate: null,
        mode: 'Any',
    });
    _(accessRule).each(function(value, key) {
        if (key === "mode") {
            if (req.mode != value)
                resultRule.availMode = false;
        } else if (key == "role") {
            if (!PrairieRole.isAsPowerful(req.userRole, value))
                resultRule.availIdentity = false;
        } else if (key == "uids") {
            if (!_(value).contains(req.userUID))
                resultRule.availIdentity = false;
        } else if (key == "credit") {
            // no action
        } else if (key === "startDate") {
            if (!isDateBeforeNow(value))
                resultRule.availDate = false;
        } else if (key === "endDate") {
            if (!isDateAfterNow(value)) {
                resultRule.availDate = false;
                resultRule.expired = true;
            }
        } else {
            // default to blocking access if we don't recognize a rule
            availDefault = false;
        }
    });
    // logical-AND the accessRule tests together (they all need to be satisfied)
    resultRule.avail = resultRule.availMode && resultRule.availIdentity && resultRule.availDate && resultRule.availDefault;
    return resultRule;
};

var checkTestAvail = function(req, tid) {
    var avail = false;
    var credit = 0;
    var nextDate = null;
    var visibleAccess = [];
    if (_(courseDB.testDB).has(tid)) {
        var info = courseDB.testDB[tid];
        if (info.allowAccess) {
            // copy and annotate the list of access rules
            var allowAccess = _(info.allowAccess).map(function(r) {return checkTestAccessRule(req, tid, r);});

            // logical-OR the accessRules together (only need one of them to be satisfied)
            avail = _.chain(allowAccess).pluck('avail').any().value();

            // take the maximum credit from the avail rules
            var availAllowAccess = _(allowAccess).filter(_.matcher({avail: true}));
            credit = _.chain(availAllowAccess).pluck('credit').max().value();
            // find the first rule that is avail and has maximum credit, and set it to be active
            var activeRule = _(availAllowAccess).find(function(r) {return r.credit == credit;});
            if (activeRule) activeRule.active = true;

            // only show access rules to users who will at some point be able to see them
            var visibleAccess;
            if (PrairieRole.hasPermission(req.userRole, 'changeMode')) {
                visibleAccess = _(allowAccess).filter(_.matcher({availIdentity: true}));
            } else {
                visibleAccess = _(allowAccess).filter(_.matcher({availIdentity: true, availMode: true}));
            }

            // strip information unless authorized to view
            if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
                visibleAccess = _(visibleAccess).map(function(r) {return _(r).omit('role', 'uids');});
            }
            if (!PrairieRole.hasPermission(req.userRole, 'changeMode')) {
                visibleAccess = _(visibleAccess).map(function(r) {return _(r).omit('mode');});
            }

            // nextDate is the first visible future endDate with positive credit, if any
            var unexpiredCredit = _(visibleAccess).filter(function(r) {return !r.expired && (r.credit > 0);})
            var endDates = _.chain(unexpiredCredit).pluck('endDate').reject(_.isNull).sortBy(_.identity).value();
            nextDate = (endDates.length == 0) ? null : endDates[0];
        }
    }
    if (PrairieRole.hasPermission(req.userRole, 'bypassAccess')) {
        avail = true;
    }
    return {avail: avail, credit: credit, nextDate: nextDate, visibleAccess: visibleAccess};
};

var filterTestsByAvail = function(req, tests, callback) {
    async.filter(tests, function(test, objCallback) {
        var result = checkTestAvail(req, test.tid);
        _(test).extend(result);
        objCallback(result.avail);
    }, callback);
};

var ensureTestAvail = function(req, test, callback) {
    var result = checkTestAvail(req, test.tid);
    _(test).extend(result);
    if (result.avail) {
        callback(null, test);
    } else {
        callback("Error accessing tid: " + test.tid);
    }
};

var ensureTestAvailByTID = function(req, tid, callback) {
    var result = checkTestAvail(req, tid);
    if (result.avail) {
        callback(null, tid);
    } else {
        callback("Error accessing tid: " + tid);
    }
};

var uidToRole = function(uid) {
    var role = "Student";
    if (_(config.roles).has(uid)) {
        role = config.roles[uid];
        if (!PrairieRole.isRoleValid(role)) {
            logger.error("Invalid role '" + role + "' for UID '" + uid + "', resetting to least permissive role.");
            role = PrairieRole.leastPermissiveRole();
        }
    }
    return role;
};

var checkObjAuth = function(req, obj, operation) {
    var authorized = false;
    if (operation == "read") {
        if (PrairieRole.hasPermission(req.authRole, 'viewOtherUsers')) {
            authorized = true;
        }
    } else if (operation == "write") {
        if (PrairieRole.hasPermission(req.authRole, 'editOtherUsers')) {
            authorized = true;
        }
    } else {
        logger.error("Unknown operation in checkObjAuth: " + operation);
    }
    if (obj.uid === req.userUID) {
        // if we have an associated test, check its availDate as well
        var testAuthorized = true;
        if (obj.tid !== undefined) {
            testAuthorized = checkTestAvail(req, obj.tid);
        }
        if (testAuthorized) {
            if (obj.availDate === undefined) {
                authorized = true;
            } else {
                if (isDateBeforeNow(obj.availDate))
                    authorized = true;
            }
        }
    }
    return authorized;
};

var filterObjsByAuth = function(req, objs, operation, callback) {
    async.filter(objs, function(obj, objCallback) {
        objCallback(checkObjAuth(req, obj, operation));
    }, callback);
};

var ensureObjAuth = function(req, obj, operation, callback) {
    if (checkObjAuth(req, obj, operation)) {
        callback(null);
    } else {
        callback("Insufficient permissions for operation " + operation + ": " + req.path);
    }
};

var ensureQuestionInTest = function(qid, tInstance, test, callback) {
    questionInTest = false;
    if (tInstance && _(tInstance).has("qids")) {
        if (_(tInstance.qids).contains(qid)) {
            questionInTest = true;
        }
    } else {
        if (_(test).has("qids")) {
            if (_(test.qids).contains(qid)) {
                questionInTest = true;
            }
        }
    }
    if (questionInTest) {
        return callback(null);
    } else {
        return callback("Insufficient permissions to access question: " + qid);
    }
};

var stripPrivateFields = function(obj) {
    if (_.isArray(obj))
        return _(obj).map(function(item) {return stripPrivateFields(item);});
    if (!_.isObject(obj))
        return obj;
    var newObj = obj;
    if (_(obj).has("_private")) {
        newObj = _(obj).omit("_private");
        var newObj = _(newObj).omit(obj._private);
    }
    _(newObj).each(function(value, key) {
        newObj[key] = stripPrivateFields(value);
    });
    return newObj;
};

app.use(function(req, res, next) {
    logRequest();

    // bypass auth for local file serving
    if (config.localFileserver) {
        if (req.path == "/"
            || req.path == "/index.html"
            || req.path == "/version.js"
            || req.path == "/config.js"
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

        if (!authUID) return sendError(res, 403, "No X-Auth-UID header and no authUID cookie", {path: req.path});
        if (!authName) return sendError(res, 403, "No X-Auth-Name header and no authName cookie", {path: req.path});
        if (!authDate) return sendError(res, 403, "No X-Auth-Date header and no authDate cookie", {path: req.path});
        if (!authSignature) return sendError(res, 403, "No X-Auth-Signature header and no authSignature cookie", {path: req.path});

        if (!mode) mode = 'Default';
        if (!userUID) userUID = authUID;

        authUID = authUID.toLowerCase();
        userUID = userUID.toLowerCase();

        var authRole = uidToRole(authUID);
        if (!userRole) userRole = authRole;

        var checkData = authUID + "/" + authName + "/" + authDate;
        var checkSignature = hmacSha256(checkData, config.secretKey).toString();
        if (authSignature !== checkSignature) {
            return sendError(res, 403, "Invalid X-Auth-Signature for " + authUID);
        }

        // authorization succeeded, store data in the request
        req.authUID = authUID;
        req.authName = authName;
        req.authDate = authDate;
        req.authSignature = authSignature;
        req.authRole = authRole;
        req.mode = mode;
        req.userUID = userUID;
        req.userRole = userRole;
    } else {
        return sendError(res, 500, "Invalid authType: " + config.authType);
    }

    // if we have an invalid userRole, then die
    if (!PrairieRole.isRoleValid(req.userRole)) {
        return sendError(res, 403, "Invalid userRole: " + userRole);
    }
    // make sure userRole is not more powerful than authRole
    req.userRole = PrairieRole.leastPermissive(req.userRole, req.authRole);
    
    // make sure only authorized users can change UID
    if (!PrairieRole.hasPermission(req.authRole, 'viewOtherUsers')) {
        req.userUID = req.authUID;
    }

    // make sure only authorized users can change mode
    var serverMode = 'Public'; // FIXME: determine from client IP
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
            } catch (e) {}
        }
    }
    if (req.mode == 'Default' || !PrairieRole.hasPermission(req.authRole, 'changeMode')) {
        req.mode = serverMode;
    }

    // add authUID to DB if not already present
    db.uCollect.update(
        {uid: req.authUID},
        {$setOnInsert: {uid: req.authUID, name: req.authName, dateAdded: (new Date()).toISOString()}},
        {upsert: true, w: 1},
        function(err) {
            if (err) {
                return sendError(res, 500, "error adding user: " + req.authUID, err);
            }

            // Check whether or not userUID is a valid UID
            if (userUID === authUID) {
                return next();
            }
            db.uCollect.findOne({uid: userUID}, function(err, uObj) {
                if (!uObj) {
                    return sendError(res, 400, "No user with uid " + userUID);
                }
                next();
            });
        }
    );
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
        if (db.accessCollect) {
            db.accessCollect.insert(access);
        };
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

if (config.authType === 'eppn') {
    app.get("/auth", function (req, res) {
        res.json({ "uid": req.authUID });
    });
}

var getGitDescribe = function(callback) {
    var cmd = 'git';
    var options = ["describe", "--long", "--abbrev=40", "HEAD"];
    var env = {
        'timeout': 5000, // milliseconds
        'cwd': '.',
    };
    child_process.execFile(cmd, options, env, function(err, stdout, stderr) {
        if (err) return callback(err);
        var gitDescribe = stdout.trim();
        callback(null, gitDescribe);
    });
};

app.get("/version", function(req, res) {
    getGitDescribe(function(err, gitDescribe) {
        if (err) return res.json({});
        var PLVersion = {
            gitDescribe: gitDescribe,
        };
        res.json(PLVersion);
    });
});

app.get("/heartbeat", function(req, res) {
    res.send("System is up.\n");
});

app.get("/course", function(req, res) {
    var course = {
        name: courseDB.courseInfo.name,
        title: courseDB.courseInfo.title,
        timezone: courseDB.courseInfo.timezone,
        devMode: false,
    };
    if (config.authType == 'none') {
        course.devMode = true;
    }
    if (PrairieRole.hasPermission(req.userRole, 'viewCoursePulls')) {
        course.gitCourseBranch = courseDB.courseInfo.gitCourseBranch;
        course.remoteFetchURL = courseDB.courseInfo.remoteFetchURL;
    }
    res.json(course);
});

var getCourseCommitFromDisk = function(callback) {
    var cmd = 'git';
    var options = [
        'show',
        '-s',
        '--format=subject:%s%ncommitHash:%H%nrefNames:%D%nauthorName:%an%nauthorEmail:%ae%nauthorDate:%aI%ncommitterName:%cn%ncommitterEmail:%ce%ncommitterDate:%cI',
        'HEAD'
    ];
    if (config.polyfillGitShow) {
        options = [
            'show',
            '-s',
            '--format=subject:%s%ncommitHash:%H%nrefNames:%d%nauthorName:%an%nauthorEmail:%ae%nauthorDate:%ai%ncommitterName:%cn%ncommitterEmail:%ce%ncommitterDate:%ci',
            'HEAD'
        ];
    }
    var env = {
        'timeout': 5000, // milliseconds
        'cwd': config.courseDir,
    };
    child_process.execFile(cmd, options, env, function(err, stdout, stderr) {
        if (err) return callback(err);
        var commit = {};
        _(stdout.split('\n')).each(function(line) {
            if (line.length <= 0) return;
            var i = line.indexOf(':');
            if (i < 0) return logger.warn('Unable to parse "git show" output: ' + line);
            var key = line.slice(0, i);
            var val = line.slice(i + 1);
            var validKeys = ['subject', 'commitHash', 'refNames',
                             'authorName', 'authorEmail', 'authorDate',
                             'committerName', 'committerEmail', 'committerDate'];
            if (!_(validKeys).contains(key)) return logger.warn('Unknown key in "git show": ' + key);
            commit[key] = val;
        });
        if (!commit.commitHash || commit.commitHash.length != 40) {
            return callback(Error('Invalid or missing commitHash from "git show"',
                                  {cmd: cmd, options: options, env: env, stdout: stdout}));
        }
        if (config.polyfillGitShow) {
            if (_.isString(commit.refNames)) {
                commit.refNames = commit.refNames.replace(/^ *\((.*)\)$/, "$1");
            }
            if (_.isString(commit.authorDate)) {
                commit.authorDate = commit.authorDate.replace(/^([^ ]+) ([^ ]+) ([^ ]+)$/, "$1T$2$3");
            }
            if (_.isString(commit.committerDate)) {
                commit.committerDate = commit.committerDate.replace(/^([^ ]+) ([^ ]+) ([^ ]+)$/, "$1T$2$3");
            }
        }
        callback(null, commit);
    });
};

var gitPullCourseOrigin = function(callback) {
    var cmd = 'git';
    if (!config.gitCourseBranch) return callback(Error('config.gitCourseBranch is not defined'));
    var args = ['pull', 'origin', config.gitCourseBranch];
    var options = {
        'timeout': 20000, // milliseconds
        'cwd': config.courseDir,
        'stdio': ['ignore', 'pipe', 'ignore'], // we only care about stdout
    };

    var ps = child_process.spawn(cmd, args, options);
    var bufList = [];

    ps.stdout.on('data', function(data) {
        bufList.push(new Buffer(data));
    });

    ps.stdout.on('close', function(code) {
        if (code) return callback(new Error("git exited with non-zero exit code " + code));
        callback(null, Buffer.concat(bufList).toString('utf8').trim());
    });
};

var cleanPull = function(obj) {
    return {
        pid: obj.pid,
        createSource: obj.createSource,
        createDate: obj.createDate,
        createUID: obj.createUID,
        createRemoteFetchURL: obj.createRemoteFetchURL,
        createBranch: obj.createBranch,
        createResult: obj.createResult,
        subject: obj.subject,
        commitHash: obj.commitHash,
        refNames: obj.refNames,
        authorName: obj.authorName,
        authorEmail: obj.authorEmail,
        authorDate: obj.authorDate,
        committerName: obj.committerName,
        committerEmail: obj.committerEmail,
        committerDate: obj.committerDate,
    };
};

var ensureDiskCommitInDB = function(callback) {
    getCourseCommitFromDisk(function(err, commit) {
        if (err) return callback(err);
        db.pullCollect.findOne({commitHash: commit.commitHash}, function(err, obj) {
            if (err) return callback(err);
            if (obj) return callback(null, cleanPull(obj));
            var pull = _.defaults(commit, {
                createSource: 'External',
                createDate: (new Date()).toISOString(),
                createUID: '',
                createRemoteFetchURL: '',
                createBranch: '',
                createResult: '',
            });
            db.newID('pid', function(err, pid) {
                if (err) return callback(err);
                pull.pid = pid;
                db.pullCollect.insert(pull, {w: 1}, function(err) {
                    if (err) return callback(err);
                    callback(null, pull);
                });
            });
        });
    });
};

app.get("/coursePulls", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewCoursePulls')) {
        return res.json([]);
    }
    if (!config.gitCourseBranch) {
        return res.json([]);
    }
    ensureDiskCommitInDB(function(err) {
        if (err) return sendError(res, 500, "Error mapping disk commit to DB", err);
        db.pullCollect.find({}, function(err, cursor) {
            if (err) return sendError(res, 500, "Error accessing database", err);
            cursor.toArray(function(err, objs) {
                if (err) return sendError(res, 500, "Error serializing", err);
                async.map(objs, function(obj, callback) {
                    callback(null, cleanPull(obj));
                }, function(err, objs) {
                    if (err) return sendError(res, 500, "Error cleaning objects", err);
                    res.json(objs);
                });
            });
        });
    });
});

app.get("/coursePulls/current", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewCoursePulls')) {
        return res.json({});
    }
    if (!config.gitCourseBranch) {
        return res.json({});
    }
    ensureDiskCommitInDB(function(err, pull) {
        if (err) return sendError(res, 500, "Error mapping disk commit to DB", err);
        res.json(pull);
    });
});

var undefQuestionServers = function(callback) {
    // Only try and undefine modules that are already defined, as listed in:
    //     requireFrontend.s.contexts._.defined
    // This is necessary because of incomplete questions (in particular, those with info.json but no server.js).
    async.each(_(courseDB.questionDB).keys(), function(qid, cb) {
        filePaths.questionFilePath(qid, "server.js", function(err, fileInfo) {
            if (err) {
                logger.info("Unable to locate server.js path for QID: " + qid);
                return cb(null); // don't error, just skip this question
            }
            var serverFilePath = path.join(fileInfo.root, fileInfo.filePath);
            if (_(requireFrontend.s.contexts._.defined).has(serverFilePath)) {
                requireFrontend.undef(serverFilePath);
            }
            cb(null);
        });
    }, function(err) {
        if (err) return callback(err);
        callback(null);
    });
};

app.post("/coursePulls", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'editCoursePulls')) {
        return sendError(res, 403, "Insufficient permissions to access.");
    }
    if (!config.gitCourseBranch) {
        return sendError(res, 500, "Syncing not enabled.");
    }
    courseDB.getCourseOriginURL(function(err, originURL) {
        if (err) return sendError(res, 500, "Unable to get originURL", err);
        gitPullCourseOrigin(function(err, pullResult) {
            if (err) return sendError(res, 500, "Unable to git pull", err);
            getCourseCommitFromDisk(function(err, commit) {
                if (err) return sendError(res, 500, "Unable to get current commit", err);
                var pull = _.defaults(commit, {
                    createSource: 'Web',
                    createDate: (new Date()).toISOString(),
                    createUID: req.userUID,
                    createRemoteFetchURL: originURL,
                    createBranch: config.gitCourseBranch,
                    createResult: pullResult,
                });
                db.newID('pid', function(err, pid) {
                    if (err) return sendError(res, 500, "Unable to get new pid", err);
                    pull.pid = pid;
                    db.pullCollect.insert(pull, {w: 1}, function(err) {
                        if (err) return sendError(res, 500, "Unable to insert pull", err);
                        loadAndInitCourseData(function(err) {
                            if (err) return sendError(res, 500, "Error reloading data", err);
                            undefQuestionServers(function(err) {
                                if (err) return sendError(res, 500, "Error undefining question servers", err);
                                initTestData(function(err) {
                                    if (err) return sendError(res, 500, "Error initializing tests", err);
                                    res.json(cleanPull(pull));
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.post("/reload", function(req, res) {
    if (config.authType != "none") {
        return sendError(res, 500, "Server not in dev mode");
    }
    logger.infoOverride("Reloading all data");
    loadAndInitCourseData(function(err) {
        if (err) return sendError(res, 500, "Error reloading data", err);
        undefQuestionServers(function(err) {
            if (err) return sendError(res, 500, "Error undefining question servers", err);
            var query = {uid: req.authUID};
            deleteObjects(req, query, db.tiCollect, 'tInstances', function(err) {
                if (err) return sendError(res, 500, 'Error deleting objects', err);
                initTestData(function(err) {
                    if (err) return sendError(res, 500, "Error initializing tests", err);
                    logger.infoOverride("Reload complete");
                    res.json({success: true});
                });
            });
        });
    });
});

app.get("/questions", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewAllQuestions')) {
        return res.json({});
    };
    async.map(_.values(courseDB.questionDB), function(item, callback) {
        callback(null, {qid: item.qid, title: item.title, number: item.number});
    }, function(err, results) {
        res.json(stripPrivateFields(results));
    });
});

app.get("/questions/:qid", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewAllQuestions')) {
        return res.json({});
    };
    var info = courseDB.questionDB[req.params.qid];
    if (info === undefined)
        return sendError(res, 404, "No such question: " + req.params.qid);
    res.json(stripPrivateFields({qid: info.qid, title: info.title, number: info.number, video: info.video}));
});

app.get("/qInstances/:qiid/:filename", function(req, res) {
    var filename = req.params.filename;
    var qiid = req.params.qiid;
    readQInstance(qiid, function(err, qInstance) {
        if (err) return sendError(res, 500, "Error reading qInstance with qiid: " + qiid, err);
        ensureObjAuth(req, qInstance, "read", function(err) {
            if (err) return sendError(res, 403, "Insufficient permissions", err);
            var qid = qInstance.qid;
            filePaths.questionFilePath(qid, filename, function(err, fileInfo) {
                if (err)
                    return sendError(res, 404, "No such file '" + filename + "' for qid: " + req.params.qid, err);
                info = courseDB.questionDB[fileInfo.qid];
                if (info === undefined) {
                    return sendError(res, 404, "No such qid: " + fileInfo.qid);
                }

                if (_(info).has("clientTemplates") && _(info.clientTemplates).contains(fileInfo.filename)) {
                    // File is template which needs to be rendered
                    fs.readFile(path.join(fileInfo.root, fileInfo.filePath), function(err, data) {
                        if (err) return sendError(res, 500, "Error reading template file", err);
                        var template = _.template(data.toString());
                        var templatedText;
                        try {
                            var defaultApiServer = (
                                config.serverType + '://localhost:' + config.serverPort);
                            templatedText = template({
                                authUID: req.authUID,
                                authName: req.authName,
                                authDate: req.authDate,
                                authSignature: req.authSignature,
                                userUID: req.userUID,
                                qid: qid,
                                qiid: qiid,
                                tiid: qInstance.tiid,
                                apiServer: PLConfig.apiServer || defaultApiServer
                            });
                        } catch (e) {
                            return sendError(res, 500, "Error rendering template", e);
                        }
                        res.type(fileInfo.filePath);
                        res.send(templatedText);
                    });
                } else if (_(info).has("clientFiles") && _(info.clientFiles).contains(fileInfo.filename)) {
                    // File is a regular file
                    res.sendFile(fileInfo.filePath, {root: fileInfo.root});
                } else {
                    // File is in neither clientFiles nor clientTemplates
                    sendError(res, 404, "Access denied to '" + fileInfo.filename + "' for qid: " + fileInfo.qid);
                }
            });
        });
    });
});

app.get("/tests/:tid/:filename", function(req, res) {
    var tid = req.params.tid;
    var filename = req.params.filename;
    var testPath = path.join(courseDB.courseInfo.testsDir, tid);
    var fullFilePath = path.join(testPath, filename);
    info = courseDB.testDB[tid];
    if (info === undefined) {
        return sendError(res, 404, "No such tid: " + fileInfo.tid);
    }
    ensureTestAvailByTID(req, tid, function(err, tid) {
        if (err) return sendError(res, 500, "Unable to access tid: " + tid, err);
        if (!_(info).has("clientFiles")) {
            return sendError(res, 500, "Test does not have clientFiles, tid: " + tid);
        }
        if (!_(info.clientFiles).contains(filename)) {
            return sendError(res, 404, "Access denied to '" + filename + "' for tid: " + tid);
        }
        res.sendFile(filename, {root: testPath});
    });
});

app.get("/clientCode/:filename", function(req, res) {
    var fullFilePath = path.join(config.clientCodeDir, req.params.filename);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            return sendError(res, 404, 'No such file "/clientCode/' + req.params.filename + '"', err);
        }
        res.sendFile(req.params.filename, {root: config.clientCodeDir});
    });
});

app.get("/clientFiles/*", function(req, res) {
    var filename = req.params[0];
    var fullFilePath = path.join(config.clientFilesDir, filename);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            return sendError(res, 404, 'No such file "/clientFiles/' + filename + '"', err);
        }
        if (filename === '') {
            filename = '/';
        }
        res.sendFile(filename, {root: config.clientFilesDir}, function(err) {
            if (err) {
                return sendError(res, 500, 'Error fetching "/clientFiles/' + filename + '"', err);
            }
        });
    });
});

app.get("/text/:filename", function(req, res) {
    res.sendFile(req.params.filename, {root: path.join(config.courseDir, "text")});
});

app.get("/users", function(req, res) {
    if (!db.uCollect) {
        return sendError(res, 500, "Do not have access to the users database collection");
    }
    db.uCollect.find({}, {"uid": 1, "name": 1}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing users database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing users", err);
            }
            async.map(objs, function(u, callback) {
                callback(null, {
                    name: u.name,
                    uid: u.uid,
                    role: uidToRole(u.uid),
                });
            }, function(err, objs) {
                if (err) {
                    return sendError(res, 500, "Error cleaning users", err);
                }
                filterObjsByAuth(req, objs, "read", function(objs) {
                    res.json(stripPrivateFields(objs));
                });
            });
        });
    });
});

app.get("/users/:uid", function(req, res) {
    if (!db.uCollect) {
        return sendError(res, 500, "Do not have access to the users database collection");
    }
    db.uCollect.findOne({uid: req.params.uid}, function(err, uObj) {
        if (err) {
            return sendError(res, 500, "Error accessing users database for uid " + req.params.uid, err);
        }
        if (!uObj) {
            return sendError(res, 404, "No user with uid " + req.params.uid);
        }
        var obj = {
            name: uObj.name,
            uid: uObj.uid,
            role: uidToRole(uObj.uid),
        };
        ensureObjAuth(req, obj, "read", function(err) {
            if (err) return sendError(res, 403, err);
            res.json(stripPrivateFields(obj));
        });
    });
});

var addQuestionToQInstance = function(qInstance, req, callback) {
    if (!_(qInstance).has("qid")) return callback("no qid in qInstance");
    var qid = qInstance.qid;
    if (!_(courseDB.questionDB).has(qid)) return callback("unknown qid: " + qid);
    if (PrairieRole.hasPermission(req.userRole, 'viewAllQuestions')) {
        qInstance.title = courseDB.questionDB[qid].title;
        qInstance.video = courseDB.questionDB[qid].video;
        return callback(null, qInstance);
    };
    if (!_(qInstance).has("tiid")) {
        // no TIID, we must have authorization, just add the info
        qInstance.title = courseDB.questionDB[qid].title;
        qInstance.video = courseDB.questionDB[qid].video;
        return callback(null, qInstance);
    }
    var tiid = qInstance.tiid;
    readTInstance(tiid, function(err, tInstance) {
        if (err) return callback(err);
        var tid = tInstance.tid;
        readTest(tid, function(err, test) {
            if (err) return callback(err);
            readTInstance(tiid, function(err, tInstance) {
                if (err) return callback(err);
                if (_(test).has("hideQuestionTitleWhileOpen") && test.hideQuestionTitleWhileOpen) {
                    if (_(tInstance).has("open") && !tInstance.open) {
                        qInstance.title = courseDB.questionDB[qid].title;
                        qInstance.video = courseDB.questionDB[qid].video;
                    } else {
                        qInstance.title = "No title";
                    }
                    return callback(null, qInstance);
                }
                if (_(test).has("showQuestionTitle") && !test.showQuestionTitle) {
                    qInstance.title = "No title";
                    return callback(null, qInstance);
                }
                qInstance.title = courseDB.questionDB[qid].title;
                qInstance.video = courseDB.questionDB[qid].video;
                return callback(null, qInstance);
            });
        });
    });
};

var addQuestionToQInstances = function(qInstances, req, callback) {
    async.each(qInstances, function(qInstance, cb) {
        addQuestionToQInstance(qInstance, req, cb);
    }, function(err) {
        if (err) return callback(err);
        callback(null, qInstances);
    });
};

app.get("/qInstances", function(req, res) {
    if (!db.qiCollect) {
        return sendError(res, 500, "Do not have access to the qInstances database collection");
    }
    var query = {};
    if ("uid" in req.query) {
        query.uid = req.query.uid;
    }
    if ("qid" in req.query) {
        query.qid = req.query.qid;
    }
    if ("vid" in req.query) {
        query.vid = req.query.vid;
    }
    db.qiCollect.find(query, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing qInstances database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing qInstances", err);
            }
            filterObjsByAuth(req, objs, "read", function(objs) {
                addQuestionToQInstances(objs, req, function(err, objs) {
                    if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                    res.json(stripPrivateFields(objs));
                });
            });
        });
    });
});

app.get("/qInstances/:qiid", function(req, res) {
    if (!db.qiCollect) {
        return sendError(res, 500, "Do not have access to the qInstances database collection");
    }
    db.qiCollect.findOne({qiid: req.params.qiid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing qInstances database for qiid " + req.params.qiid, err);
        }
        if (!obj) {
            return sendError(res, 404, "No qInstance with qiid " + req.params.qiid);
        }
        ensureObjAuth(req, obj, "read", function(err) {
            if (err) return sendError(res, 403, err);
            addQuestionToQInstance(obj, req, function(err, obj) {
                if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                res.json(stripPrivateFields(obj));
            });
        });
    });
});

var makeQInstance = function(req, res, qInstance, callback) {
    if (qInstance.uid === undefined) {
        return sendError(res, 400, "No user ID provided");
    }
    if (qInstance.qid === undefined) {
        return sendError(res, 400, "No question ID provided");
    }
    qInstance.date = new Date();
    var info = courseDB.questionDB[qInstance.qid];
    if (info === undefined) {
        return sendError(res, 400, "Invalid QID: " + qInstance.qid);
    }
    if (!_.isString(qInstance.vid) || qInstance.vid.length === 0) {
        qInstance.vid = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
    }
    ensureObjAuth(req, qInstance, "write", function(err) {
        if (err) return sendError(res, 403, err);
        db.newID("qiid", function(err, qiid) {
            if (err) return sendError(res, 500, "Unable to get new qiid", err);
            qInstance.qiid = qiid;
            loadQuestionServer(qInstance.qid, function(err, server) {
                if (err) return sendError(res, 500, "Unable to load question server for QID: " + qInstance.qid, err);
                var questionDir = path.join(config.questionsDir, info.qid);
                var questionData;
                try {
                    questionData = server.getData(qInstance.vid, info.options, questionDir);
                    qInstance.params = questionData.params || {};
                    qInstance.trueAnswer = questionData.trueAnswer || {};
                    qInstance.options = questionData.options || {};
                    qInstance._private = ["trueAnswer"];
                } catch (e) {
                    return sendError(res, 500, "Error in " + qInstance.qid + " getData(): " + e.toString(), {stack: e.stack});
                }
                db.qiCollect.insert(qInstance, {w: 1}, function(err) {
                    if (err) {
                        return sendError(res, 500, "Error writing qInstance to database", err);
                    }
                    return callback(qInstance);
                });
            });
        });
    });
};

var checkForExistingSubmission = function(qiid, tid, callback) {
    if (!qiid) return callback(null, null);
    var info = courseDB.testDB[tid];
    var testType = info.type;
    if (!(testType == "Game" || testType == "Basic")) return callback(null, null);
    db.sCollect.findOne({qiid: qiid}, function(err, existingSubmission) {
        if (err) return callback(err);
        if (existingSubmission) return callback(null, null);
        callback(null, qiid);
    });
};

var getExistingQInstance = function(qiid, callback) {
    if (!qiid) return callback(null, null);
    db.qiCollect.findOne({qiid: qiid}, function(err, obj) {
        if (err) return callback(err);
        callback(null, obj);
    });
};

app.post("/qInstances", function(req, res) {
    var uid = req.body.uid;
    var qid = req.body.qid;

    // does not have tid or tiid
    if (!_(req.body).has("tid") && !_(req.body).has("tiid")) {
        if (!PrairieRole.hasPermission(req.userRole, 'createQIDWithoutTID')) {
            return sendError(res, 403, "Insufficient permissions");
        };
        var qInstance = {
            uid: uid,
            qid: qid,
        };
        if (PrairieRole.hasPermission(req.userRole, 'overrideVID') && _(req.body).has('vid')) {
            qInstance.vid = req.body.vid;
        };
        makeQInstance(req, res, qInstance, function(qInstance) {
            addQuestionToQInstance(qInstance, req, function(err, qInstance) {
                if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                res.json(stripPrivateFields(qInstance));
            });
        });
        return;
    }

    // has tid but not tiid
    if (_(req.body).has("tid") && !_(req.body).has("tiid")) {
        if (!PrairieRole.hasPermission(req.userRole, 'createQIDWithoutTIID')) {
            return sendError(res, 403, "Insufficient permissions");
        };
        var qInstance = {
            uid: uid,
            qid: qid,
            tid: req.body.tid,
        };
        if (PrairieRole.hasPermission(req.userRole, 'overrideVID') && _(req.body).has('vid')) {
            qInstance.vid = req.body.vid;
        };
        var tid = qInstance.tid;
        readTest(tid, function(err, test) {
            if (err) return sendError(res, 500, "Error reading test", err);
            ensureObjAuth(req, test, "read", function(err) {
                if (err) return sendError(res, 403, "Insufficient permissions", err);
                var tInstance = null;
                ensureQuestionInTest(qid, tInstance, test, function(err) {
                    if (err) return sendError(res, 404, "Invalid request", err);
                    makeQInstance(req, res, qInstance, function(qInstance) {
                        addQuestionToQInstance(qInstance, req, function(err, qInstance) {
                            if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                            res.json(stripPrivateFields(qInstance));
                        });
                    });
                });
            });
        });
        return;
    }

    // assume we have a tiid from here on
    var tiid = req.body.tiid;
    var qInstance = {
        uid: uid,
        qid: qid,
        tiid: tiid,
    };
    if (PrairieRole.hasPermission(req.userRole, 'overrideVID') && _(req.body).has('vid')) {
        qInstance.vid = req.body.vid;
    };
    readTInstance(qInstance.tiid, function(err, tInstance) {
        if (err) return sendError(res, 500, "Error reading tInstance", {tiid: tiid, err: err});
        var qiid = null;
        if (tInstance.qiidsByQid) {
            if (tInstance.qiidsByQid[qid]) {
                qiid = tInstance.qiidsByQid[qid];
            }
        }
        checkForExistingSubmission(qiid, tInstance.tid, function(err, qiid) {
            if (err) return sendError(res, 500, "Error checking submission", err);
            getExistingQInstance(qiid, function(err, obj) {
                if (err) return sendError(res, 500, "Error getting existing qInstance", err);
                if (obj) {
                    ensureObjAuth(req, obj, "read", function(err) {
                        if (err) return sendError(res, 403, err);
                        addQuestionToQInstance(qInstance, req, function(err, qInstance) {
                            if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                            res.json(stripPrivateFields(obj));
                        });
                    });
                } else {
                    var tid = tInstance.tid;
                    qInstance.tid = tid;
                    readTest(tid, function(err, test) {
                        if (err) return sendError(res, 500, "Error reading test", err);
                        if (test.options.autoCreateQuestions) {
                            return sendError(res, 403, "QIID creation disallowed for tiid: ", tInstance.tiid);
                        } else {
                            ensureObjAuth(req, tInstance, "read", function(err) {
                                if (err) return sendError(res, 403, err);
                                ensureQuestionInTest(qid, tInstance, test, function(err) {
                                    if (err) return sendError(res, 403, err);
                                    if (tInstance.vidsByQID) {
                                        qInstance.vid = tInstance.vidsByQID[qid];
                                    }
                                    makeQInstance(req, res, qInstance, function(qInstance) {
                                        tInstance.qiidsByQid = tInstance.qiidsByQid || {};
                                        tInstance.qiidsByQid[qid] = qInstance.qiid;
                                        writeTInstance(req, res, tInstance, function() {
                                            addQuestionToQInstance(qInstance, req, function(err, qInstance) {
                                                if (err) return sendError(res, 500, "Error adding question to qInstance", err);
                                                res.json(stripPrivateFields(qInstance));
                                            });
                                        });
                                    });
                                });
                            });
                        }
                    });
                }
            });
        });
    });
});

app.get("/submissions", function(req, res) {
    if (!db.sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    var query = {};
    if ("uid" in req.query) {
        query.uid = req.query.uid;
    }
    if ("qid" in req.query) {
        query.qid = req.query.qid;
    }
    db.sCollect.find(query, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing submissions database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing submissions", err);
            }
            filterObjsByAuth(req, objs, "read", function(objs) {
                res.json(stripPrivateFields(objs));
            });
        });
    });
});

app.get("/submissions/:sid", function(req, res) {
    if (!db.sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    db.sCollect.findOne({sid: req.params.sid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing submissions database for sid " + req.params.sid, err);
        }
        if (!obj) {
            return sendError(res, 404, "No submission with sid " + req.params.sid);
        }
        ensureObjAuth(req, obj, "read", function(err) {
            if (err) return sendError(res, 403, err);
            res.json(stripPrivateFields(obj));
        });
    });
});

var deepClone = function(obj) {
    return JSON.parse(JSON.stringify(obj));
};

var readTInstance = function(tiid, callback) {
    db.tiCollect.findOne({tiid: tiid}, function(err, obj) {
        if (err) return callback(err);
        if (!obj) return callback("No tInstance with tiid: " + tiid);
        return callback(null, obj);
    });
};

var readQInstance = function(qiid, callback) {
    db.qiCollect.findOne({qiid: qiid}, function(err, obj) {
        if (err) return callback(err);
        if (!obj) return callback("No qInstance with qiid: " + qiid);
        return callback(null, obj);
    });
};

var loadQuestionServer = function(qid, callback) {
    filePaths.questionFilePath(qid, "server.js", function(err, fileInfo) {
        if (err) return callback(err);
        var serverFilePath = path.join(fileInfo.root, fileInfo.filePath);
        requireFrontend([serverFilePath], function(server) {
            if (server === undefined) return callback("Unable to load 'server.js' for qid: " + qid);
            return callback(null, server);
        });
    });
};

var readTest = function(tid, callback) {
    db.tCollect.findOne({tid: tid}, function(err, obj) {
        if (err) return callback(err)
        if (!obj) return callback("No test with tid: " + tid);
        delete obj.dueDate;
        return callback(null, obj);
    });
};

var loadTestServer = function(tid, callback) {
    var info = courseDB.testDB[tid];
    var testType = info.type;
    callback(require("./" + testType + "TestServer.js"));
};

var writeTInstance = function(req, res, obj, callback) {
    if (obj.tiid === undefined)
        return sendError(res, 500, "No tiid for write to tInstance database", {tInstance: obj});
    if (obj._id !== undefined)
        delete obj._id;
    ensureObjAuth(req, obj, "write", function(err) {
        if (err) return sendError(res, 403, err);
        db.tiCollect.update({tiid: obj.tiid}, {$set: obj}, {upsert: true, w: 1}, function(err) {
            if (err)
                return sendError(res, 500, "Error writing tInstance to database", {tInstance: obj, err: err});
            return callback();
        });
    });
};

var writeTest = function(req, res, obj, callback) {
    if (obj.tid === undefined)
        return sendError(res, 500, "No tid for write to test database", {test: obj});
    if (obj._id !== undefined)
        delete obj._id;
    db.tCollect.update({tid: obj.tid}, {$set: obj}, {upsert: true, w: 1}, function(err) {
        if (err)
            return sendError(res, 500, "Error writing test to database", {test: obj, err: err});
        return callback();
    });
};

var testProcessSubmission = function(req, res, tiid, submission, callback) {
    readTInstance(tiid, function(err, tInstance) {
        if (err) return sendError(res, 500, "Error reading tInstance", {tiid: tiid, err: err});
        ensureObjAuth(req, tInstance, "read", function(err) {
            if (err) return sendError(res, 403, err);
            var tid = tInstance.tid;
            readTest(tid, function(err, test) {
                if (err) return sendError(res, 500, "Error reading test", err);
                ensureTestAvail(req, test, function(err, test) {
                    if (err) return sendError(res, 400, "Error accessing tid: " + tid, err);
                    loadTestServer(tid, function(server) {
                        var uid = submission.uid;
                        server.updateWithSubmission(tInstance, test, submission, courseDB.testDB[tid].options, function(err) {
                            if (err) {
                                return sendError(res, 500, "Error updating test: " + String(err), {err: err, stack: err.stack});
                            }

                            if (!test.options.autoCreateQuestions) {
                                if (tInstance.qiidsByQid) {
                                    delete tInstance.qiidsByQid[submission.qid];
                                }
                            }

                            writeTInstance(req, res, tInstance, function() {
                                writeTest(req, res, test, function() {
                                    return callback(submission);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

app.post("/submissions", function(req, res) {
    if (!db.sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    if (!db.uCollect) {
        return sendError(res, 500, "Do not have access to the users database collection");
    }
    var submission = {
        date: new Date(),
        uid: req.body.uid,
        qiid: req.body.qiid,
        submittedAnswer: req.body.submittedAnswer
    };
    if (submission.uid === undefined) {
        return sendError(res, 400, "No user ID provided");
    }
    if (submission.qiid === undefined) {
        return sendError(res, 400, "No qInstance ID provided");
    }
    if (submission.submittedAnswer === undefined && req.body.overrideScore === undefined) {
        return sendError(res, 400, "No submittedAnswer provided");
    }
    if (req.body.overrideScore !== undefined) {
        if (!PrairieRole.hasPermission(req.userRole, 'overrideScore'))
            return sendError(res, 403, "Superuser permissions required for override");
        submission.overrideScore = req.body.overrideScore;
    }
    if (req.body.practice !== undefined) {
        submission.practice = req.body.practice;
    }
    ensureObjAuth(req, submission, "write", function(err) {
        if (err) return sendError(res, 403, err);
        readQInstance(submission.qiid, function(err, qInstance) {
            if (err) return sendError(res, 500, "Error reading qInstance", {qiid: submission.qiid, err: err});
            ensureObjAuth(req, qInstance, "read", function(err) {
                if (err) return sendError(res, 403, err);
                submission.qid = qInstance.qid;
                submission.vid = qInstance.vid;
                var tiid = qInstance.tiid;
                var tid = qInstance.tid;
                if (!tid && !tiid) {
                    if (!PrairieRole.hasPermission(req.userRole, 'createQIDWithoutTID')) {
                        return sendError(res, 403, "Insufficient permissions");
                    };
                }
                if (tid && !tiid) {
                    if (!PrairieRole.hasPermission(req.userRole, 'createQIDWithoutTIID')) {
                        return sendError(res, 403, "Insufficient permissions");
                    };
                }
                var info = courseDB.questionDB[submission.qid];
                if (info === undefined) {
                    return sendError(res, 404, "No such QID: " + submission.qid);
                }
                var options = info.options || {};
                options = _.defaults(options, qInstance.options || {});
                loadQuestionServer(submission.qid, function(err, server) {
                    if (err) return sendError(res, 500, "Unable to load question server for QID: " + submission.qid, err);
                    if (submission.overrideScore !== undefined) {
                        submission.score = submission.overrideScore;
                    } else {
                        var questionDir = path.join(config.questionsDir, info.qid);
                        var grading;
                        try {
                            grading = server.gradeAnswer(qInstance.vid, qInstance.params, qInstance.trueAnswer, submission.submittedAnswer, options, questionDir);
                        } catch (e) {
                            return sendError(res, 500, "Error in " + submission.qid + " gradeAnswer(): " + e.toString(), {stack: e.stack});
                        }
                        submission.score = _.isNumber(grading.score) ? grading.score : 0; // make sure score is a Number
                        submission.score = Math.max(0, Math.min(1, submission.score)); // clip to [0, 1]
                        if (grading.feedback)
                            submission.feedback = grading.feedback;
                    }
                    submission.trueAnswer = qInstance.trueAnswer;
                    db.newID("sid", function(err, sid) {
                        if (err) return sendError(res, 500, "Unable to get new sid", err);
                        submission.sid = sid;
                        if (tiid) {
                            testProcessSubmission(req, res, tiid, submission, function(submission) {
                                db.sCollect.insert(submission, {w: 1}, function(err) {
                                    if (err) return sendError(res, 500, "Error writing submission to database", err);
                                    res.json(stripPrivateFields(submission));
                                });
                            });
                        } else {
                            db.sCollect.insert(submission, {w: 1}, function(err) {
                                if (err) return sendError(res, 500, "Error writing submission to database", err);
                                res.json(stripPrivateFields(submission));
                            });
                        }
                    });
                });
            });
        });
    });
});

app.get("/tests", function(req, res) {
    if (!db.tCollect) {
        return sendError(res, 500, "Do not have access to the tCollect database collection");
    }
    db.tCollect.find({}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tCollect database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing tests", err);
            }
            objs = _(objs).filter(function(o) {return _(courseDB.testDB).has(o.tid);});
            _(objs).each(function(test) {
                delete test.dueDate;
            });
            filterTestsByAvail(req, objs, function(objs) {
                res.json(stripPrivateFields(objs));
            });
        });
    });
});

app.get("/tests/:tid", function(req, res) {
    if (!db.tCollect) return sendError(res, 500, "Do not have access to the tCollect database collection");
    db.tCollect.findOne({tid: req.params.tid}, function(err, obj) {
        if (err) return sendError(res, 500, "Error accessing tCollect database for tid " + req.params.tid, err);
        if (!obj) return sendError(res, 404, "No test with tid " + req.params.tid);
        delete obj.dueDate;
        ensureTestAvail(req, obj, function(err) {
            if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
            res.json(stripPrivateFields(obj));
        });
    });
});

app.get("/tests/:tid/client.js", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function(err) {
        if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
        var filePath = path.join(req.params.tid, "client.js");
        res.sendFile(filePath, {root: courseDB.courseInfo.testsDir});
    });
});

app.get("/tests/:tid/common.js", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function(err) {
        if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
        var filePath = path.join(req.params.tid, "common.js");
        res.sendFile(filePath, {root: courseDB.courseInfo.testsDir});
    });
});

app.get("/tests/:tid/test.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function(err) {
        if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
        var filePath = path.join(req.params.tid, "test.html");
        res.sendFile(filePath, {root: courseDB.courseInfo.testsDir});
    });
});

app.get("/tests/:tid/testOverview.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function(err) {
        if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
        var filePath = path.join(req.params.tid, "testOverview.html");
        res.sendFile(filePath, {root: courseDB.courseInfo.testsDir});
    });
});

app.get("/tests/:tid/testSidebar.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function(err) {
        if (err) return sendError(res, 500, "Error accessing test with tid: " + req.params.tid, err);
        var filePath = path.join(req.params.tid, "testSidebar.html");
        res.sendFile(filePath, {root: courseDB.courseInfo.testsDir});
    });
});

var deleteObjects = function(req, query, collect, collectName, callback) {
    var cursor = collect.find(query);
    var allErrs = [];
    cursor.forEach(function(doc) {
        if (!checkObjAuth(req, doc, "write")) return allErrs.push("insufficient permissions");
        db.newID('did', function(err, did) {
            if (err) return allErrs.push(err);
            var deleteRecord = {
                did: did,
                timestamp: (new Date()).toISOString(),
                authUID: req.authUID,
                authRole: req.authRole,
                userUID: req.userUID,
                userRole: req.userRole,
                mode: req.mode,
                collection: collectName,
                document: doc
            };
            db.dCollect.insert(deleteRecord, {w: 1}, function(err) {
                if (err) return allErrs.push(err);
                collect.remove({_id: doc._id}, function(err) {
                    if (err) return allErrs.push(err);
                });
            });
        });
    }, function(err) {
        if (err) return callback({err: err, allErrs: allErrs});
        if (allErrs.length > 0) return callback(allErrs);
        callback(null);
    });
};

app.delete("/tInstances", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'deleteTInstances')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var tid = req.query.tid;
    var uid = req.query.uid;
    if (!tid) {
        return sendError(res, 400, "No tid provided");
    }
    var info = courseDB.testDB[tid];
    if (!info) {
        return sendError(res, 404, "Unknown tid: " + tid);
    }
    var query = {tid: tid};
    if (uid) {
        query.uid = uid;
    }
    deleteObjects(req, query, db.tiCollect, 'tInstances', function(err) {
        if (err) return sendError(res, 500, 'Error deleting objects', err);
        res.json({});
    });
});

var autoCreateTestQuestions = function(req, res, tInstance, test, callback) {
    if (test.options.autoCreateQuestions && tInstance.qids !== undefined) {
        tInstance.qiidsByQid = tInstance.qiidsByQid || {};
        async.each(tInstance.qids, function(qid, cb) {
            if (_(tInstance.qiidsByQid).has(qid)) {
                cb(null);
            } else {
                var qInstance = {
                    qid: qid,
                    uid: tInstance.uid,
                    tiid: tInstance.tiid,
                    tid: tInstance.tid,
                };
                if (tInstance.vidsByQID) {
                    qInstance.vid = tInstance.vidsByQID[qid];
                }
                makeQInstance(req, res, qInstance, function(qInstance) {
                    tInstance.qiidsByQid[qid] = qInstance.qiid;
                    cb(null);
                });
            }
        }, function(err) {
            if (err)
                return sendError(res, 400, "Error creating qInstances", {tiid: tInstance.tiid, err: err});
            callback();
        });
    } else {
        callback();
    }
};

var updateTInstance = function(req, res, server, tInstance, test, callback) {
    server.updateTInstance(tInstance, test, test.options, courseDB.questionDB);
    autoCreateTestQuestions(req, res, tInstance, test, function() {
        callback();
    });
};

var updateTInstances = function(req, res, tInstances, updateCallback) {
    async.each(tInstances, function(tInstance, callback) {
        var tid = tInstance.tid;
        if (!courseDB.testDB[tid]) return callback(null);
        readTest(tid, function(err, test) {
            if (err) return sendError(res, 500, "Error reading test", err);
            loadTestServer(tid, function(server) {
                var oldJSON = JSON.stringify(tInstance);
                updateTInstance(req, res, server, tInstance, test, function() {
                    var newJSON = JSON.stringify(tInstance);
                    if (newJSON !== oldJSON) {
                        writeTInstance(req, res, tInstance, function() {
                            callback(null);
                        });
                    } else {
                        callback(null);
                    }
                });
            });
        });
    }, function(err) {
        if (err)
            return sendError(res, 500, "Error updating tInstances", err);
        updateCallback();
    });
};

var autoCreateTInstances = function(req, res, tInstances, autoCreateCallback) {
    var tiDB = _(tInstances).groupBy("tid");
    async.each(_(courseDB.testDB).values(), function(test, callback) {
        var tid = test.tid;
        testStatus = checkTestAvail(req, tid);
        if (testStatus.avail && !test.multipleInstance && tiDB[tid] === undefined && req.query.uid !== undefined) {
            readTest(tid, function(err, test) {
                if (err) return sendError(res, 500, "Error reading test", err);
                loadTestServer(tid, function(server) {
                    db.newID("tiid", function(err, tiid) {
                        if (err) return sendError(res, 500, "Unable to get new tiid", err);
                        var tInstance = {
                            tiid: tiid,
                            tid: tid,
                            uid: req.query.uid,
                            date: new Date(),
                            number: 1,
                        };
                        updateTInstance(req, res, server, tInstance, test, function() {
                            writeTInstance(req, res, tInstance, function() {
                                tiDB[tInstance.tid] = [tInstance];
                                callback(null);
                            });
                        });
                    });
                });
            });
        } else {
            callback(null);
        }
    }, function(err) {
        if (err)
            return sendError(res, 500, "Error autoCreating tInstances", err);
        var tInstances = _.chain(tiDB).values().flatten(true).value();
        autoCreateCallback(tInstances);
    });
};

var eliminateDuplicateTInstances = function(req, res, tInstances, eliminateCallback) {
    var tiDB = _(tInstances).groupBy("tid");
    var cleanTIDB = {};
    async.forEachOf(tiDB, function(tiList, tid, callback) {
        readTest(tid, function(err, test) {
            if (err) return sendError(res, 500, "Error reading test", err);
            if (!test.multipleInstance) {
                // we should only have a single tInstance for this test, so enforce this
                // if we have multiple tInstances, pick the one with the highest score
                var sortedTIList = _(tiList).sortBy('score');
                cleanTIDB[tid] = [_(sortedTIList).last()];
            } else {
                cleanTIDB[tid] = tiList;
            }
            callback(null);
        });
    }, function(err) {
        if (err) return sendError(res, 500, "Error eliminating duplicate tInstances", err);
        var tInstances = _.chain(cleanTIDB).values().flatten(true).value();
        eliminateCallback(tInstances);
    });
}

app.get("/tInstances", function(req, res) {
    if (!db.tiCollect) {
        return sendError(res, 500, "Do not have access to the tiCollect database collection");
    }
    var query = {};
    if ("uid" in req.query) {
        query.uid = req.query.uid;
    }
    db.tiCollect.find(query, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        cursor.toArray(function(err, tInstances) {
            if (err) {
                return sendError(res, 500, "Error serializing tInstances", err);
            }
            tInstances = _(tInstances).filter(function(ti) {return _(courseDB.testDB).has(ti.tid);});
            filterObjsByAuth(req, tInstances, "read", function(tInstances) {
                updateTInstances(req, res, tInstances, function() {
                    autoCreateTInstances(req, res, tInstances, function(tInstances) {
                        filterObjsByAuth(req, tInstances, "read", function(tInstances) {
                            eliminateDuplicateTInstances(req, res, tInstances, function(tInstances) {
                                res.json(stripPrivateFields(tInstances));
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get("/tInstances/:tiid", function(req, res) {
    if (!db.tiCollect) {
        return sendError(res, 500, "Do not have access to the tiCollect database collection");
    }
    db.tiCollect.findOne({tiid: req.params.tiid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        if (!obj) {
            return sendError(res, 404, "No tInstance with tiid " + req.params.tiid);
        }
        ensureObjAuth(req, obj, "read", function(err) {
            if (err) return sendError(res, 403, err);
            res.json(stripPrivateFields(obj));
        });
    });
});

app.post("/tInstances", function(req, res) {
    var uid = req.body.uid;
    var tid = req.body.tid;
    if (uid === undefined) {
        return sendError(res, 400, "No uid provided");
    }
    if (tid === undefined) {
        return sendError(res, 400, "No tid provided");
    }
    var testInfo = courseDB.testDB[tid];
    if (testInfo === undefined) {
        return sendError(res, 400, "Invalid tid: " + tid, {tid: tid});
    }
    if (!testInfo.multipleInstance) {
        return sendError(res, 400, "Test can only be autoCreated", {tid: tid});
    }
    db.tiCollect.find({tid: tid, uid: uid}, {"number": 1}, function(err, cursor) {
        if (err) {
            return sendError(res, 400, "Error searching for pre-existing tInstances", {err: err});
        }
        var number = 1;
        cursor.each(function(err, item) {
            if (err) {
                return sendError(res, 400, "Error iterating over tiids", {err: err});
            }
            if (item != null) {
                if (item.number !== undefined && item.number >= number)
                    number = item.number + 1;
            } else {
                // end of collection

                ensureTestAvailByTID(req, tid, function(err) {
                    if (err) return sendError(res, 400, "Invalid tid: " + tid, {tid: tid});
                    readTest(tid, function(err, test) {
                        if (err) return sendError(res, 500, "Error reading test", err);
                        loadTestServer(tid, function(server) {
                            db.newID("tiid", function(err, tiid) {
                                if (err) return sendError(res, 500, "Unable to get new tiid", err);
                                var tInstance = {
                                    tiid: tiid,
                                    tid: tid,
                                    uid: req.query.uid,
                                    date: new Date(),
                                    number: number,
                                };
                                updateTInstance(req, res, server, tInstance, test, function() {
                                    writeTInstance(req, res, tInstance, function() {
                                        res.json(stripPrivateFields(tInstance));
                                    });
                                });
                            });
                        });
                    });
                });
            }
        });
    });
});

var releaseTrueAnswers = function(tInstance, callback) {
    async.each(tInstance.qids, function(qid, callback) {
        var qiid = tInstance.qiidsByQid[qid];
        db.qiCollect.update({qiid: qiid}, {$pull: {_private: "trueAnswer"}}, function(err) {
            callback(err);
        });
    }, callback);
};

var finishTest = function(req, res, tiid, callback) {
    readTInstance(tiid, function(err, tInstance) {
        if (err) return sendError(res, 500, "Error reading tInstance", {tiid: tiid, err: err});
        ensureObjAuth(req, tInstance, "write", function(err) {
            if (err) return sendError(res, 403, err);
            var tid = tInstance.tid;
            readTest(tid, function(err, test) {
                if (err) return sendError(res, 500, "Error reading test", err);
                loadTestServer(tid, function(server) {
                    try {
                        server.finish(tInstance, test);
                    } catch (e) {
                        return sendError(res, 500, "Error finishing test: " + String(e), {err: e, stack: e.stack});
                    }
                    writeTInstance(req, res, tInstance, function() {
                        writeTest(req, res, test, function() {
                            releaseTrueAnswers(tInstance, function(err) {
                                if (err) return sendError(res, 500, "Error releasing answers: " + err);
                                return callback(tInstance);
                            });
                        });
                    });
                });
            });
        });
    });
};

var gradeTest = function(req, res, tiid, callback) {
    readTInstance(tiid, function(err, tInstance) {
        if (err) return sendError(res, 500, "Error reading tInstance", {tiid: tiid, err: err});
        ensureObjAuth(req, tInstance, "write", function(err) {
            if (err) return sendError(res, 403, err);
            var tid = tInstance.tid;
            readTest(tid, function(err, test) {
                if (err) return sendError(res, 500, "Error reading test", err);
                loadTestServer(tid, function(server) {
                    try {
                        server.grade(tInstance, test);
                    } catch (e) {
                        return sendError(res, 500, "Error grading test: " + String(e), {err: e, stack: e.stack});
                    }
                    writeTInstance(req, res, tInstance, function() {
                        writeTest(req, res, test, function() {
                            return callback(tInstance);
                        });
                    });
                });
            });
        });
    });
};

app.patch("/tInstances/:tiid", function(req, res) {
    var tiid = req.params.tiid;
    if (tiid === undefined) {
        return sendError(res, 400, "No tiid provided");
    }
    if (req.body.open !== undefined && req.body.open === false) {
        finishTest(req, res, tiid, function(tInstance) {
            res.json(stripPrivateFields(tInstance));
        });
    } else if (req.body.graded !== undefined && req.body.graded === true) {
        gradeTest(req, res, tiid, function(tInstance) {
            res.json(stripPrivateFields(tInstance));
        });
    } else {
        return sendError(res, 400, "Invalid patch on tInstance");
    }
});

var closeOpenTInstances = function(req, res, tid, callback) {
    db.tiCollect.find({tid: tid}, function(err, cursor) {
        if (err) return callback(err);
        var tiids = [];
        var item;
        async.doUntil(function(cb) { // body
            cursor.next(function(err, r) {
                if (err) return cb(err);
                item = r;
                if (item != null) {
                    var tiid = item.tiid;
                    if (!tiid) return cb("Error accessing tiid");
                    if (item.open) {
                        finishTest(req, res, tiid, function(tInstance) {
                            tiids.push(tiid);
                            cb(null);
                        });
                    } else {
                        cb(null);
                    }
                } else {
                    cb(null);
                }
            });
        }, function() { // test
            return (item == null);
        }, function(err) { // finalize
            if (err) return callback(err);
            callback(null, tiids);
        });
    });
};

app.post("/finishes", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'editOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var tid = req.body.tid;
    if (!tid) {
        return sendError(res, 400, "No tid provided");
    }
    db.newID('fid', function(err, fid) {
        if (err) return sendError(res, 500, "Error creating fid", err);
        var finish = {
            fid: fid,
            tid: tid,
            uid: req.userUID,
            authUID: req.authUID,
            date: (new Date).toISOString(),
        };
        closeOpenTInstances(req, res, tid, function(err, tiids) {
            if (err) return sendError(res, 500, "Error closing open tInstances", err);
            finish.tiidsClosed = tiids;
            db.fCollect.insert(finish, {w: 1}, function(err) {
                if (err) return sendError(500, "Error inserting finish", err);
                res.json(finish);
            });
        });
    });
});

var getQDataByQID = function(test, tInstance) {
    var qDataByQID = {};
    if (_(tInstance).has('questionsByQID')) {
        // RetryExam
        _(tInstance.questionsByQID).each(function(question, qid) {
            qDataByQID[qid] = {
                points: question.awardedPoints,
                score: question.awardedPoints / test.maxQScoresByQID[qid],
                nAttempts: question.nGradedAttempts,
                everCorrect: question.correct,
            };
        });
    } else if (_(tInstance).has('qids') && _(tInstance).has('submissionsByQid')) {
        // Exam
        _(tInstance.qids).each(function(qid) {
            qDataByQID[qid] = {
                points: 0,
                score: 0,
                nAttempts: 0,
                everCorrect: false,
            };
        });
        _(tInstance.submissionsByQid).each(function(submission) {
            var qid = submission.qid;
            if (_(qDataByQID).has(qid)) {
                qDataByQID[qid].nAttempts++;
                if (submission.score >= 0.5) {
                    qDataByQID[qid].points = 1;
                    qDataByQID[qid].score = 1;
                    qDataByQID[qid].everCorrect = true;
                }
            }
        });
    } else if (_(test).has('qids') && _(tInstance).has('qData')) {
        // Basic and Game
        _(test.qids).each(function(qid) {
            qDataByQID[qid] = {
                points: 0,
                score: 0,
                nAttempts: 0,
                everCorrect: false,
            };
        });
        _(tInstance.qData).each(function(data, qid) {
            if (_(qDataByQID).has(qid)) {
                if (_(data).has('nAttempt')) {
                    // Basic
                    qDataByQID[qid].points = data.avgScore;
                    qDataByQID[qid].score = data.avgScore;
                    qDataByQID[qid].nAttempts = data.nAttempt;
                    qDataByQID[qid].everCorrect = (data.maxScore > 0);
                } else if (_(data).has('value')) {
                    // Game
                    qDataByQID[qid].points = data.score;
                    qDataByQID[qid].score = data.score / test.maxQScoresByQID[qid];
                    qDataByQID[qid].nAttempts = 0;
                    qDataByQID[qid].everCorrect = (data.score > 0);
                }
            }
        });
    }
    return qDataByQID;
};

var getScoresForTest = function(tid, callback) {
    readTest(tid, function(err, test) {
        if (err) return callback(err);
        db.tiCollect.find({tid: tid}, function(err, cursor) {
            if (err) return callback(err);
            var scores = {};
            var tInstance;
            async.doUntil(function(cb) { // body
                cursor.next(function(err, r) {
                    if (err) return cb(err);
                    tInstance = r;
                    if (!tInstance) return cb(null);
                    var uid = tInstance.uid;
                    if (uidToRole(uid) != "Student") return cb(null);
                    try {
                        var score = tInstance.score / test.maxScore;
                        if (!scores[uid] || score > scores[uid].score) {
                            scores[uid] = {
                                score: score,
                                scorePerc: tInstance.scorePerc,
                                qDataByQID: getQDataByQID(test, tInstance),
                            };
                            if (_(tInstance).has("finishDate")) {
                                scores[uid].finishDate = tInstance.finishDate;
                            }
                        }
                    } catch (e) {
                        return cb(e);
                    };
                    cb(null);
                });
            }, function() { // test
                return (tInstance == null);
            }, function(err) { // finalize
                if (err) return callback(err);
                callback(null, scores);
            });
        });
    });
};

app.get("/testScores/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    var format = req.query.format;
    getScoresForTest(tid, function(err, scores) {
        if (err) return sendError(500, "Error getting scores for tid: " + tid, err);
        var headers;
        if (format == "compass") {
            headers = ['Username', tid];
        } else if (format == "raw") {
            headers = ['uid', tid + " raw"];
        } else {
            headers = ['uid', tid];
        }
        var csvData =  _(scores).map(function(score, uid) {
            var username = uid;
            if (format == "compass") {
                var i = uid.indexOf("@");
                if (i > 0) {
                    username = uid.slice(0, i);
                }
            }
            var row;
            if (format == "raw")
                row = [username, score.score];
            else
                row = [username, score.scorePerc];
            return row;
        });
        csvData = _(csvData).sortBy(function(row) {return row[0];});
        csvData.splice(0, 0, headers);
        csvStringify(csvData, function(err, csv) {
            if (err) return sendError(res, 500, "Error formatting CSV", err);
            res.attachment(filename);
            res.send(csv);
        });
    });
});

var addSubsForQInstance = function(req, subs, qiid, qInstance, tInstance, callback) {
    db.sCollect.find({qiid: qiid}, function(err, cursor) {
        if (err) return callback(err);
        var item;
        async.doUntil(function(cb) { // body
            cursor.next(function(err, r) {
                if (err) return cb(err);
                item = r;
                if (item != null) {
                    if (!checkObjAuth(req, item, "read")) return cb("Insufficient permissions");
                    var submission = item;
                    subs.push({
                        uid: submission.uid,
                        tid: tInstance.tid,
                        tiid: tInstance.tiid,
                        qid: qInstance.qid,
                        qiid: qInstance.qiid,
                        sid: submission.sid,
                        vid: qInstance.vid,
                        date: submission.date,
                        params: qInstance.params,
                        options: qInstance.options,
                        overrideScore: submission.overrideScore,
                        practice: submission.practice,
                        trueAnswer: qInstance.trueAnswer,
                        submittedAnswer: submission.submittedAnswer,
                        score: submission.score,
                        correct: ((submission.score >= 0.5) ? 1 : 0),
                        feedback: submission.feedback,
                    });
                    cb(null);
                } else {
                    cb(null);
                }
            });
        }, function() { // test
            return (item == null);
        }, function(err) { // finalize
            if (err) return callback(err);
            callback(null);
        });
    });
};

var addSubsForTInstance = function(req, subs, tiid, tInstance, callback) {
    db.qiCollect.find({tiid: tiid}, function(err, cursor) {
        if (err) return callback(err);
        var item;
        async.doUntil(function(cb) { // body
            cursor.next(function(err, r) {
                if (err) return cb(err);
                item = r;
                if (item != null) {
                    if (!checkObjAuth(req, item, "read")) return cb("Insufficient permissions");
                    addSubsForQInstance(req, subs, item.qiid, item, tInstance, function(err) {
                        if (err) return cb(err);
                        cb(null);
                    });
                } else {
                    cb(null);
                }
            });
        }, function() { // test
            return (item == null);
        }, function(err) { // finalize
            if (err) return callback(err);
            callback(null);
        });
    });
};

var addSubsForTest = function(req, subs, tid, callback) {
    db.tiCollect.find({tid: tid}, function(err, cursor) {
        if (err) return callback(err);
        var item;
        async.doUntil(function(cb) { // body
            cursor.next(function(err, r) {
                if (err) return cb(err);
                item = r;
                if (item != null) {
                    if (!checkObjAuth(req, item, "read")) return cb("Insufficient permissions");
                    addSubsForTInstance(req, subs, item.tiid, item, function(err) {
                        if (err) return cb(err);
                        cb(null);
                    });
                } else {
                    cb(null);
                }
            });
        }, function() { // test
            return (item == null);
        }, function(err) { // finalize
            if (err) return callback(err);
            callback(null);
        });
    });
};

var subsToCSV = function(subs, headers, callback) {
    subs.sort(function(a, b) {
        return (a.uid < b.uid) ? -1
            : ((a.uid > b.uid) ? 1
               : ((a.tiid < b.tiid) ? -1
                  : ((a.tiid > b.tiid) ? 1
                     : ((a.qid < b.qid) ? -1
                        : ((a.qid > b.qid) ? 1
                           : ((a.date < b.date) ? -1
                              : ((a.date > b.date) ? 1
                                 : 0)))))));
    });
    var csvData = _(subs).map(function(v) {
        if (v.date) v.date = moment(v.date).tz(config.timezone).format();
        return _(headers).map(function(key) {return v[key];});
    });
    csvData.splice(0, 0, headers);
    csvStringify(csvData, function(err, csv) {
        if (err) return callback(err);
        callback(null, csv);
    });
};

app.get("/testAllSubmissions/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    var subs = [];
    addSubsForTest(req, subs, tid, function(err) {
        if (err) return sendError(res, 500, "Error getting submissions for test", err);
        var headers = ["uid", "tid", "tiid", "qid", "qiid", "sid", "vid", "date", "params", "options",
                       "overrideScore", "practice", "trueAnswer", "submittedAnswer", "score", "correct", "feedback"];
        subsToCSV(subs, headers, function(err, csv) {
            if (err) return sendError(res, 500, "Error formatting CSV", err);
            res.attachment(filename);
            res.send(csv);
        });
    });
});

var addFinalSubsForTInstance = function(req, subs, tiid, tInstance, callback) {
    if (_(tInstance).has('qids') && _(tInstance).has('submissionsByQid')) {
        async.each(tInstance.qids, function(qid, cb) {
            if (!tInstance.qiidsByQid) return cb("No qiidsByQid");
            var qiid = tInstance.qiidsByQid[qid];
            if (!qiid) return cb("No qiidsByQid.qid for qid: " + qid);
            db.qiCollect.findOne({qiid: qiid}, function(err, qInstance) {
                if (err) return cb(err);
                if (!qInstance) return cb("No qInstance with qiid " + qiid);
                if (checkObjAuth(req, qInstance, "read")) {
                    var sub = {
                        uid: qInstance.uid,
                        tid: tInstance.tid,
                        tiid: tInstance.tiid,
                        qid: qInstance.qid,
                        qiid: qInstance.qiid,
                        vid: qInstance.vid,
                        params: qInstance.params,
                        options: qInstance.options,
                        trueAnswer: qInstance.trueAnswer,
                    };
                    var submission = tInstance.submissionsByQid[qid];
                    if (submission) {
                        sub.sid = submission.sid;
                        sub.date = submission.date;
                        sub.overrideScore = submission.overrideScore;
                        sub.practice = submission.practice;
                        sub.submittedAnswer = submission.submittedAnswer;
                        sub.score = submission.score;
                        sub.feedback = submission.feedback;
                    }
                    if (_(tInstance).has('questionsByQID')) {
                        var question = tInstance.questionsByQID[qid];
                        if (question) {
                            sub.nGradedAttempts = question.nGradedAttempts;
                            sub.awardedPoints = question.awardedPoints;
                            sub.correct = question.correct;
                        }
                    }
                    subs.push(sub);
                    return cb(null);
                } else {
                    return cb("Insufficient permissions");
                }
            });
        }, function(err) {
            if (err) return callback(err);
            callback(null);
        });
    } else {
        addSubsForTInstance(req, subs, tiid, tInstance, function(err) {
            if (err) return callback(err);
            callback(null);
        });
    }
};

var addFinalSubsForTest = function(req, subs, tid, callback) {
    db.tiCollect.find({tid: tid}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        var tInstances = {};
        var item;
        async.doUntil(function(cb) { // body
            cursor.next(function(err, r) {
                if (err) return cb(err);
                item = r;
                if (item != null) {
                    if (!checkObjAuth(req, item, "read")) return cb("Insufficient permissions");
                    var uid = item.uid;
                    if (tInstances[uid] === undefined) {
                        tInstances[uid] = item;
                    } else {
                        if (item.score > tInstances[uid].score)
                            tInstances[uid] = item;
                    }
                }
                cb(null);
            });
        }, function() { // test
            return (item == null);
        }, function(err) { // finalize
            if (err) return callback(err);
            async.forEachOf(tInstances, function(tInstance, uid, cb) {
                addFinalSubsForTInstance(req, subs, tInstance.tiid, tInstance, function(err) {
                    if (err) return cb(err);
                    cb(null);
                });
            }, function(err) {
                if (err) return callback(err);
                callback(null);
            });
        });
    });
};

app.get("/testFinalSubmissions/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    var subs = [];
    addFinalSubsForTest(req, subs, tid, function(err) {
        if (err) return sendError(res, 500, "Error getting submissions for test", err);
        var headers = ["uid", "tid", "tiid", "qid", "qiid", "sid", "vid", "date", "params", "options",
                       "overrideScore", "practice", "trueAnswer", "submittedAnswer", "score", "correct", "feedback",
                       "nGradedAttempts", "awardedPoints"];
        subsToCSV(subs, headers, function(err, csv) {
            if (err) return sendError(res, 500, "Error formatting CSV", err);
            res.attachment(filename);
            res.send(csv);
        });
    });
});

var subsToFiles = function(subs, callback) {
    var files = [];
    async.each(subs, function(sub, cb) {
        if (sub.uid && sub.qid && sub.params && sub.params.fileName && sub.submittedAnswer && sub.submittedAnswer.fileData) {
            files.push({
                filename: sub.uid + '_' + sub.qid + '_' + sub.params.fileName,
                contents: new Buffer(sub.submittedAnswer.fileData, 'base64'),
            });
        }
            cb(null);
    }, function(err) {
        if (err) return callback(err);
        callback(null, files);
    });
};

var filesToZip = function(files, dirname, callback) {
    var zip = archiver.create('zip', {});
    zip.append(null, {name: dirname + '/'});
    async.each(files, function(file, cb) {
        zip.append(file.contents, {name: dirname + '/' + file.filename});
        cb(null);
    }, function(err) {
        if (err) callback(err);
        zip.finalize();
        callback(null, zip);
    });
};

var streamToBuffer = function(stream, callback) {
    var data = [];
    stream.on('data', function(b) {
        data.push(b);
    });
    stream.on('error', function(err) {
        callback(err);
    });
    stream.on('end', function() {
        var buffer = Buffer.concat(data);
        callback(null, buffer);
    });
};

app.get("/testFilesZip/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    var subs = [];
    addFinalSubsForTest(req, subs, tid, function(err) {
        if (err) return sendError(res, 500, "Error getting submissions for test", err);
        subsToFiles(subs, function(err, files) {
            if (err) return sendError(res, 500, "Error converting subs to files", err);
            var dirname = tid + '_files';
            filesToZip(files, dirname, function(err, zip) {
                if (err) return sendError(res, 500, "Error zipping files", err);
                streamToBuffer(zip, function(err, zipBuffer) {
                    if (err) return sendError(res, 500, "Error converting zip to buffer", err);
                    res.attachment(filename);
                    res.send(zipBuffer);
                });
            });
        });
    });
});

var densityEst = function(data, bandwidth, grid) {
    var densities = _(grid).map(_.constant(0));
    _(data).each(function(d) {
        var kernel = _(grid).map(function(v) {return Math.exp(-Math.pow((d - v) / bandwidth, 2));});
        densities = numeric.add(densities, kernel);
    });
    return densities;
};

var computeTestStats = function(tid, scores, callback) {
    readTest(tid, function(err, test) {
        if (err) return callback(err);
        try {
            var totalScoresToStats = function(totalScores) {
                var lowerQuartile = 0, upperQuartile = 0, lowerWhisker = 0, upperWhisker = 0, outliers = [];
                if (totalScores.length > 0) {
                    var sortedScores = totalScores.slice().sort(function(a, b) {return a - b;});
                    lowerQuartile = sortedScores[Math.max(0, Math.round(totalScores.length * 1/4) - 1)];
                    upperQuartile = sortedScores[Math.round(totalScores.length * 3/4) - 1];
                    var iqr = upperQuartile - lowerQuartile;
                    var lowerWhiskerPoints = _(totalScores).filter(function(s) {return s > lowerQuartile - 1.5 * iqr;});
                    var upperWhiskerPoints = _(totalScores).filter(function(s) {return s < upperQuartile + 1.5 * iqr;});
                    lowerWhisker = lowerQuartile;
                    upperWhisker = upperQuartile;
                    if (lowerWhiskerPoints.length > 0) lowerWhisker = _.min(lowerWhiskerPoints);
                    if (upperWhiskerPoints.length > 0) upperWhisker = _.max(upperWhiskerPoints);
                    outliers = _(totalScores).filter(function(s) {return (s < lowerWhisker) || (s > upperWhisker);});
                }
                var minScore = 0, maxScore = 0, grid = [], densities = [];
                if (totalScores.length > 0) {
                    minScore = jStat.min(totalScores);
                    maxScore = jStat.max(totalScores);
                    var bandwidth = 0.05;
                    grid = numeric.linspace(0, 1, 401);
                    grid = _(grid).filter(function(s) {return (s > minScore - 2 * bandwidth) && (s < maxScore + 2 * bandwidth);});
                    densities = densityEst(totalScores, bandwidth, grid);
                }
                return {
                    tid: tid,
                    count: totalScores.length,
                    mean: jStat.mean(totalScores),
                    median: jStat.median(totalScores),
                    stddev: jStat.stdev(totalScores),
                    min: minScore,
                    max: maxScore,
                    hist: PrairieGeom.histogram(totalScores, 10, 0, 1),
                    nZeroScore: _(totalScores).filter(function(s) {return Math.abs(s) < 1e-8;}).length,
                    nFullScore: _(totalScores).filter(function(s) {return Math.abs(s - 1) < 1e-8;}).length,
                    lowerQuartile: lowerQuartile,
                    upperQuartile: upperQuartile,
                    lowerWhisker: lowerWhisker,
                    upperWhisker: upperWhisker,
                    outliers: outliers,
                    grid: grid,
                    densities: densities,
                };
            };
            
            var totalScores = _(scores).pluck('score');
            var stats = totalScoresToStats(totalScores);
            var scoresWithFinishDate = _(scores).filter(function(score) {return _(score).has("finishDate");});
            if (scoresWithFinishDate.length > 0) {
                scoresByDay = _(scoresWithFinishDate).groupBy(function(score) {
                    return moment.tz(score.finishDate, config.timezone).startOf('day').format();
                });
                stats.statsByDay = _(scoresByDay).mapObject(function(scores) {
                    var totalScores = _(scores).pluck('score');
                    return totalScoresToStats(totalScores);
                });
            }
            stats.byQID = {};
            var qids = _.chain(scores).pluck('qDataByQID').map(_.keys).flatten().uniq().value();
            _(qids).each(function(qid) {
                var uids = [];
                var totalScores = [];
                var questionScores = [];
                var attempts = [];
                var everCorrects = [];
                var quintile;
                _(scores).each(function(score, uid) {
                    if (_(score.qDataByQID).has(qid)) {
                        var qData = score.qDataByQID[qid];
                        uids.push(uid);
                        totalScores.push(score.score);
                        questionScores.push(qData.score);
                        attempts.push(qData.nAttempts);
                        everCorrects.push(qData.everCorrect ? 1 : 0);
                    }
                });
                stats.byQID[qid] = {
                    count: totalScores.length,
                    meanScore: (questionScores.length > 0) ? jStat.mean(questionScores) : 0,
                    meanNAttempts: (attempts.length > 0) ? jStat.mean(attempts) : 0,
                    fracEverCorrect: (everCorrects.length > 0) ? jStat.mean(everCorrects) : 0,
                    discrimination: (totalScores.length > 0) ? jStat.corrcoeff(totalScores, questionScores) : 0,
                };

                // sort scores by totalScore and then by UID to provide a stable sort
                var zipped = _.zip(totalScores, uids, questionScores);
                zipped.sort(function(a, b) {
                    return (a[0] > b[0]) ? 1
                        : ((a[0] < b[0]) ? -1
                           : ((a[1] > b[1]) ? 1
                              : ((a[1] < b[1]) ? -1
                                 : 0)));
                });
                var i1 = Math.round(zipped.length * 0.2);
                var i2 = Math.round(zipped.length * 0.4);
                var i3 = Math.round(zipped.length * 0.6);
                var i4 = Math.round(zipped.length * 0.8);
                var scores0 = _(zipped.slice(0, i1)).map(function(s) {return s[2];});
                var scores1 = _(zipped.slice(i1, i2)).map(function(s) {return s[2];});
                var scores2 = _(zipped.slice(i2, i3)).map(function(s) {return s[2];});
                var scores3 = _(zipped.slice(i3, i4)).map(function(s) {return s[2];});
                var scores4 = _(zipped.slice(i4)).map(function(s) {return s[2];});
                stats.byQID[qid].meanScoreByQuintile = [
                    (scores0.length > 0) ? jStat.mean(scores0) : 0,
                    (scores1.length > 0) ? jStat.mean(scores1) : 0,
                    (scores2.length > 0) ? jStat.mean(scores2) : 0,
                    (scores3.length > 0) ? jStat.mean(scores3) : 0,
                    (scores4.length > 0) ? jStat.mean(scores4) : 0,
                ];
            });
        } catch (e) {
            return callback(e);
        }
        callback(null, stats);
    });    
};

app.get("/testStats/:tid", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return res.json({});
    }
    var tid = req.params.tid;
    getScoresForTest(tid, function(err, scores) {
        if (err) return sendError(res, 500, "Error getting scores for tid: " + tid, err);
        computeTestStats(tid, scores, function(err, stats) {
            if (err) return sendError(res, 500, "Error computing statistics for tid: " + tid, err);
            res.json(stats);
        });
    });
});

app.get("/testStats", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return res.json({});
    }
    async.map(_(courseDB.testDB).keys(), function(tid, cb) {
        getScoresForTest(tid, function(err, scores) {
            if (err) return cb(err)
            computeTestStats(tid, scores, function(err, stats) {
                if (err) return cb(err);
                cb(null, stats);
            });
        });
    }, function(err, statsList) {
        if (err) return sendError(res, 500, "Error computing exam statistics", err);
        res.json(statsList);
    });
});

var testStatsToCSV = function(stats, callback) {
    var csvData = [
        ["statistic", "value"],
        ["Number of students", stats.count],
        ["Mean score", stats.mean * 100],
        ["Standard deviation", stats.stddev * 100],
        ["Minimum score", stats.min * 100],
        ["Median score", stats.median * 100],
        ["Maximum score", stats.max * 100],
        ["Number of 0%", stats.nZeroScore],
        ["Number of 100%", stats.nFullScore],
    ];
    csvStringify(csvData, function(err, csv) {
        if (err) return callback(err);
        callback(null, csv);
    });
};

app.get("/testStatsCSV/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    getScoresForTest(tid, function(err, scores) {
        if (err) return sendError(res, 500, "Error getting scores for tid: " + tid, err);
        computeTestStats(tid, scores, function(err, stats) {
            if (err) return sendError(res, 500, "Error computing statistics for tid: " + tid, err);
            testStatsToCSV(stats, function(err, csv) {
                if (err) return sendError(res, 500, "Error formatting CSV", err);
                res.attachment(filename);
                res.send(csv);
            });
        });
    });
});

var testStatsByDayToCSV = function(stats, callback) {
    var headers = ["date", "count", "mean", "median", "stddev", "min", "max",
                   "nZeroScore", "nFullScore", "lowerQuartile", "upperQuartile"];
    var csvData = _(stats.statsByDay).map(function(dayStats, date) {
        var row = [date];
        return row.concat(_.chain(headers).rest().map(function(h) {return dayStats[h];}).value());
    });
    // sort by first column, which is the date
    csvData.sort(function(a, b) {return (a[0] < b[0]) ? -1 : ((a[0] > b[0]) ? 1 : 0);});
    csvData.splice(0, 0, headers);
    csvStringify(csvData, function(err, csv) {
        if (err) return callback(err);
        callback(null, csv);
    });
};

app.get("/testStatsByDayCSV/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    getScoresForTest(tid, function(err, scores) {
        if (err) return sendError(res, 500, "Error getting scores for tid: " + tid, err);
        computeTestStats(tid, scores, function(err, stats) {
            if (err) return sendError(res, 500, "Error computing statistics for tid: " + tid, err);
            testStatsByDayToCSV(stats, function(err, csv) {
                if (err) return sendError(res, 500, "Error formatting CSV", err);
                res.attachment(filename);
                res.send(csv);
            });
        });
    });
});

var testQStatsToCSV = function(stats, callback) {
    var csvData = [
        [
            "QID",
            "Title",
            "Mean score",
            "Discrimination",
            "Number attempts",
            "Fraction solved",
            "Number of students",
            "Quintile 1 avg",
            "Quintile 2 avg",
            "Quintile 3 avg",
            "Quintile 4 avg",
            "Quintile 5 avg",
        ],
    ];
    _(stats.byQID).each(function(stat, qid) {
        var meanScoreByQuintile = _(stat.meanScoreByQuintile).map(function(s) {return (s * 100).toFixed(1);});
        csvData.push([
            qid,
            courseDB.questionDB[qid].title,
            stat.meanScore * 100,
            stat.discrimination * 100,
            stat.meanNAttempts,
            stat.fracEverCorrect * 100,
            stat.count,
            stat.meanScoreByQuintile[0] * 100,
            stat.meanScoreByQuintile[1] * 100,
            stat.meanScoreByQuintile[2] * 100,
            stat.meanScoreByQuintile[3] * 100,
            stat.meanScoreByQuintile[4] * 100,
        ]);
    });
    csvStringify(csvData, function(err, csv) {
        if (err) return callback(err);
        callback(null, csv);
    });
};

app.get("/testQStatsCSV/:filename", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewOtherUsers')) {
        return sendError(res, 403, "Insufficient permissions");
    }
    var filename = req.params.filename;
    var tid = req.query.tid;
    getScoresForTest(tid, function(err, scores) {
        if (err) return sendError(res, 500, "Error getting scores for tid: " + tid, err);
        computeTestStats(tid, scores, function(err, stats) {
            if (err) return sendError(res, 500, "Error computing statistics for tid: " + tid, err);
            testQStatsToCSV(stats, function(err, csv) {
                if (err) return sendError(res, 500, "Error formatting CSV", err);
                res.attachment(filename);
                res.send(csv);
            });
        });
    });
});

app.get("/stats", function(req, res) {
    if (!db.statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    db.statsCollect.find({}, {name: 1}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing statistics", err);
            }
            res.json(stripPrivateFields(objs));
        });
    });
});

app.get("/stats/submissionsPerHour", function(req, res) {
    if (!db.statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    db.statsCollect.findOne({name: "submissionsPerHour"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for submissionsPerHour", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for submissionsPerHour");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/stats/usersPerHour", function(req, res) {
    if (!db.statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    db.statsCollect.findOne({name: "usersPerHour"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for usersPerHour", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for usersPerHour");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/errorList", function(req, res) {
    if (PrairieRole.hasPermission(req.userRole, 'viewErrors')) {
        res.json({errorList: logger.errorList});
    } else {
        res.json([]);
    }
});

if (config.localFileserver) {
    app.get("/", function(req, res) {
        res.sendFile("index.html", {root: config.frontendDir});
    });

    app.get("/index.html", function(req, res) {
        res.sendFile("index.html", {root: config.frontendDir});
    });

    app.get("/version.js", function(req, res) {
        res.sendFile("version.js", {root: config.frontendDir});
    });

    app.get("/config.js", function(req, res) {
        res.sendFile("config.js", {root: config.frontendDir});
    });

    app.get("/favicon.png", function(req, res) {
        res.sendFile("favicon.png", {root: config.frontendDir});
    });

    app.get("/require/:filename", function(req, res) {
        res.sendFile(path.join("require", req.params.filename), {root: config.frontendDir});
    });

    app.get("/require/browser/:filename", function(req, res) {
        res.sendFile(path.join("require", "browser", req.params.filename), {root: config.frontendDir});
    });

    app.get("/require/ace/:filename", function(req, res) {
        res.sendFile(path.join("require", "ace", req.params.filename), {root: config.frontendDir});
    });

    app.get("/require/ace/*", function(req, res) {
        var filename = req.params[0];
        res.sendFile(path.join("require", filename), {root: config.frontendDir});
    });

    app.get("/css/:filename", function(req, res) {
        res.sendFile(path.join("css", req.params.filename), {root: config.frontendDir});
    });

    app.get("/img/:filename", function(req, res) {
        res.sendFile(path.join("img", req.params.filename), {root: config.frontendDir});
    });

    app.get("/MathJax/*", function(req, res) {
        var filename = req.params[0];
        res.sendFile(filename, {root: path.join(config.frontendDir, "MathJax")});
    });
}

var submissionsPerHour = function() {
    if (!db.sCollect) {
        logger.error("Do not have access to the 'submissions' database collection");
        return;
    }
    if (!db.statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    db.sCollect.find({}, {"date": 1, "uid": 1}, function(err, cursor) {
        if (err) {
            logger.error("unable to iterate over 'submissions' collection", err);
            return;
        }
        var hist = {};
        var firstDate;
        var lastDate = new Date();
        cursor.each(function(err, item) {
            if (err) {
                return;
            }
            var uid, date;
            if (item != null) {
                uid = item.uid;
                if (config.skipUIDs[uid]) {
                    return;
                }
                date = item.date;
                date.setMinutes(0);
                date.setSeconds(0);
                date.setMilliseconds(0);
                if (hist[date] === undefined)
                    hist[date] = 0;
                hist[date]++;
                if (firstDate === undefined || date.getTime() < firstDate.getTime())
                    firstDate = date;
            } else {
                // end of collection
                var times = [], submissions = [];
                if (firstDate !== undefined) {
                    date = firstDate;
                    do {
                        times.push(date);
                        submissions.push(hist[date] ? hist[date] : 0);
                        date = new Date(date.getTime() + 3600000);
                    } while (date.getTime() <= lastDate.getTime());
                }
                var obj = {
                    date: new Date(),
                    times: times,
                    submissions: submissions
                };
                db.statsCollect.update({name: "submissionsPerHour"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'submissionsPerHour' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var usersPerHour = function() {
    if (!db.sCollect) {
        logger.error("Do not have access to the 'submissions' database collection");
        return;
    }
    if (!db.statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    db.sCollect.find({}, {"date": 1, "uid": 1}, function(err, cursor) {
        if (err) {
            logger.error("unable to iterate over 'submissions' collection", err);
            return;
        }
        var hist = {};
        var firstDate;
        var lastDate = new Date();
        cursor.each(function(err, item) {
            if (err) {
                return;
            }
            var uid, date;
            if (item != null) {
                uid = item.uid;
                if (config.skipUIDs[uid]) {
                    return;
                }
                date = item.date;
                date.setMinutes(0);
                date.setSeconds(0);
                date.setMilliseconds(0);
                if (hist[date] === undefined)
                    hist[date] = {};
                hist[date][uid] = true;
                if (firstDate === undefined || date.getTime() < firstDate.getTime())
                    firstDate = date;
            } else {
                // end of collection
                var times = [], users = [];
                if (firstDate !== undefined) {
                    date = firstDate;
                    do {
                        times.push(date);
                        users.push(hist[date] ? Object.keys(hist[date]).length : 0);
                        date = new Date(date.getTime() + 3600000);
                    } while (date.getTime() <= lastDate.getTime());
                }
                var obj = {
                    date: new Date(),
                    times: times,
                    users: users
                };
                db.statsCollect.update({name: "usersPerHour"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'usersPerHour' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var computeStats = function() {
    submissionsPerHour();
    usersPerHour();
};

var userDB = {};

var initQuestionModels = function(callback) {
    async.eachSeries(_.values(courseDB.questionDB), function(question, cb) {
        question.dist = new PrairieModel.QuestionDist(question.qid);
        cb(null);
    }, callback);
};

var loadUserDB = function(callback) {
    db.uCollect.find({}, {"uid": 1}, function(err, cursor) {
        if (err)
            callback(err);
        cursor.each(function(err, item) {
            if (err)
                callback(err);
            if (item != null) {
                userDB[item.uid] = {uid: item.uid};
            } else {
                // end of collection
                callback(null);
            }
        });
    });
};

var initUserModels = function(callback) {
    async.eachSeries(_.values(userDB), function(user, cb) {
        user.dist = new PrairieModel.UserDist(user.uid);
        cb(null);
    }, callback);
};

var processSubmissionBayes = function(submission, iSubmission, count) {
    var correct = (submission.score >= 0.5);
    var uid = submission.uid;
    var qid = submission.qid;
    var user = userDB[uid];
    var question = courseDB.questionDB[qid];
    if (user == null || question == null)
        return;

    var pTrue = PrairieModel.userQuestionProb(user.dist, question.dist).p;
    var p = correct ? pTrue : (1 - pTrue);
    bayesStats.totalSurprise += -Math.log(p);
    if (p > 0.5)
        bayesStats.nCorrectPredictions++;
    bayesStats.nTotalPredictions++;

    PrairieModel.dynamicPrediction(user.dist, question.dist);
    PrairieModel.measurementUpdate(correct, user.dist, question.dist);
};

var processSubmissionsBayes = function(callback) {
    db.sCollect.find({}, function(err, cursor) {
        if (err)
            callback(err);
        cursor.count(function(err, count) {
            if (err)
                callback(err);
            var i = 0;
            cursor.toArray(function(err, items) {
                if (err)
                    callback(err);
                _.each(items, function(item) {
                    processSubmissionBayes(item, i++, count);
                });
                callback(null);
            });
        });
    });
};

var printUserModels = function(callback) {
    async.eachSeries(_.values(userDB), function(user, cb) {
        console.log("user", user.uid, "dist", user.dist);
        cb(null);
    }, callback);
};

var printQuestionModels = function(callback) {
    async.eachSeries(_.values(courseDB.questionDB), function(question, cb) {
        console.log("question", question.qid, "dist", question.dist);
        cb(null);
    }, callback);
};

var printBayesStats = function(callback) {
    console.log("totalSurprise", bayesStats.totalSurprise);
    console.log("averageSurprise", bayesStats.totalSurprise / bayesStats.nTotalPredictions);
    console.log("nCorrectPredictions", bayesStats.nCorrectPredictions);
    console.log("nTotalPredictions", bayesStats.nTotalPredictions);
    console.log("correctly predicted fraction", bayesStats.nCorrectPredictions / bayesStats.nTotalPredictions);
    callback(null);
};

var bayesStats = {
    totalSurprise: 0,
    nCorrectPredictions: 0,
    nTotalPredictions: 0
};

var runBayes = function(callback) {
    async.series([
        initQuestionModels,
        loadUserDB,
        initUserModels,
        processSubmissionsBayes,
        printUserModels,
        printQuestionModels,
        printBayesStats
    ], function(err) {
        if (err) {
            logger.error("Error in runBayes", err);
            callback(err);
            return;
        }
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

var startIntervalJobs = function(callback) {
    setInterval(monitor, SAMPLE_INTERVAL);
    setInterval(computeStats, STATS_INTERVAL);
    callback(null);
};

var loadAndInitCourseData = function(callback) {
    courseDB.load(function(err) {
        if (err) return callback(err);
        initTestData(callback);
    });
};

async.series([
    db.init,
    //function(callback) {models.init(); callback(null);},
    loadAndInitCourseData,
    startServer,
    startIntervalJobs,
], function(err, data) {
    if (err) {
        logger.error("Error initializing PrairieLearn server:", err, data);
        logger.error("Exiting...");
        process.exit(1);
    } else {
        logger.infoOverride("PrairieLearn server ready");
    }
});
