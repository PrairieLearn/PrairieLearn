var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({timestamp: true, colorize: true}),
    ]
});
logger.info('PrairieLearn server start');
logger.transports.console.level = 'warn';

var errorList = [];
var MemLogger = winston.transports.MemLogger = function(options) {
    this.name = 'memLogger';
    this.level = options.level || 'error';
};
MemLogger.prototype = new winston.Transport;
MemLogger.prototype.log = function(level, msg, meta, callback) {
    errorList.push({timestamp: (new Date()).toISOString(), level: level, msg: msg, meta: meta});
    callback(null, true);
};
logger.add(winston.transports.MemLogger, {});

var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var async = require("async");
var moment = require("moment-timezone");
var jju = require('jju');
var validator = require('is-my-json-valid')

var config = {};

config.timezone = 'America/Chicago';
config.dbAddress = 'mongodb://localhost:27017/data';
config.logFilename = 'server.log';
config.authType = 'none';
config.localFileserver = true;
config.serverType = 'http';
config.serverPort = '3000';
config.courseDir = "../exampleCourse";
config.frontendDir = "../frontend";
config.questionDefaultsDir = "questionDefaults";
config.secretKey = "THIS_IS_THE_SECRET_KEY"; // override in config.json
config.skipUIDs = {};
config.superusers = {};
config.roles = {"user1@illinois.edu": "Superuser"};

var readJSONSyncOrDie = function(jsonFilename, schemaFilename) {
    try {
        var data = fs.readFileSync(jsonFilename, {encoding: 'utf8'});
    } catch (e) {
        logger.error("Error reading JSON file: " + jsonFilename, e);
        process.exit(1);
    }
    try {
        var json = jju.parse(data, {mode: 'json'});
    } catch (e) {
        logger.error("Error in JSON file format: " + jsonFilename + " (line " + e.row + ", column " + e.column + ")\n"
                     + e.name + ": " + e.message);
        process.exit(1);
    }
    if (schemaFilename) {
        configValidate = validator(fs.readFileSync(schemaFilename, {encoding: 'utf8'}),
                                   {verbose: true, greedy: true});
        configValidate(json);
        if (configValidate.errors) {
            logger.error("Error in JSON file specification: " + jsonFilename);
            _(configValidate.errors).forEach(function(e) {
                logger.error('Error in field "' + e.field + '": ' + e.message
                            + (_(e).has('value') ? (' (value: ' + e.value + ')') : ''));
            });
            process.exit(1);
        }
    }
    return json;
};

var readJSON = function(jsonFilename, callback) {
    var json;
    fs.readFile(jsonFilename, {encoding: 'utf8'}, function(err, data) {
        if (err) {
            return callback("Error reading JSON file: " + jsonFilename + ": " + err);
        }
        try {
            json = jju.parse(data, {mode: 'json'});
        } catch (e) {
            return callback("Error in JSON file format: " + jsonFilename + " (line " + e.row + ", column " + e.column + ")\n"
                            + e.name + ": " + e.message);
        }
        callback(null, json);
    });
};

var validateJSON = function(json, schema, callback) {
    var configValidate;
    try {
        configValidate = validator(schema, {verbose: true, greedy: true});
    } catch (e) {
        return callback("Error loading JSON schema file: " + schemaFilename + ": " + e);
    }
    configValidate(json);
    if (configValidate.errors) {
        return callback("Error in JSON file specification: "
                        + _(configValidate.errors).map(function(e) {
                            return 'Error in field "' + e.field + '": ' + e.message
                                + (_(e).has('value') ? (' (value: ' + jju.stringify(e.value) + ')') : '');
                        }).join('; '));
    }
    callback(null, json);
};

var readInfoJSON = function(jsonFilename, schemaFilename, optionsSchemaPrefix, optionsSchemaSuffix, callback) {
    readJSON(jsonFilename, function(err, json) {
        if (err) return callback(err);
        if (schemaFilename) {
            readJSON(schemaFilename, function(err, schema) {
                if (err) return callback(err);
                validateJSON(json, schema, function(err, json) {
                    if (err) return callback("Error validating file '" + jsonFilename + "' against '" + schemaFilename + "': " + err);
                    if (optionsSchemaPrefix && optionsSchemaSuffix && _(json).has('type') && _(json).has('options')) {
                        var optionsSchemaFilename = optionsSchemaPrefix + json.type + optionsSchemaSuffix;
                        readJSON(optionsSchemaFilename, function(err, optionsSchema) {
                            if (err) return callback(err);
                            validateJSON(json.options, optionsSchema, function(err, optionsJSON) {
                                if (err) return callback("Error validating 'options' field from '" + jsonFilename + "' against '" + optionsSchemaFilename + "': " + err);
                                callback(null, json);
                            });
                        });
                    } else {
                        return callback(null, json);
                    }
                });
            });
        } else {
            return callback(null, json);
        }
    });
};

configFilename = 'config.json';
if (process.argv.length > 2) {
    configFilename = process.argv[2];
}
if (fs.existsSync(configFilename)) {
    fileConfig = readJSONSyncOrDie(configFilename, 'schemas/backendConfig.json');
    _.defaults(fileConfig, config);
    config = fileConfig;
} else {
    logger.warn("config.json not found, using default configuration");
}

config.questionsDir = path.join(config.courseDir, "questions");
config.testsDir = path.join(config.courseDir, "tests");
config.clientCodeDir = path.join(config.courseDir, "clientCode");
config.serverCodeDir = path.join(config.courseDir, "serverCode");

config.requireDir = path.join(config.frontendDir, "require");
config.relativeClientCodeDir = path.relative(path.resolve(config.requireDir), path.resolve(config.clientCodeDir));
config.relativeServerCodeDir = path.relative(path.resolve(config.requireDir), path.resolve(config.serverCodeDir));

_(config.superusers).forEach(function(value, key) {
    if (value)
        config.roles[key] = "Superuser";
    else
        config.roles[key] = "Student";
});

logger.add(winston.transports.File, {filename: config.logFilename, level: 'info'});
logger.info('activated file logging: ' + config.logFilename);

var requirejs = require("requirejs");

requirejs.config({
    nodeRequire: require,
    baseUrl: config.requireDir,
    paths: {
        clientCode: config.relativeClientCodeDir,
        serverCode: config.relativeServerCodeDir,
    },
});

requirejs.onError = function(err) {
    var data = {errorMsg: err.toString()};
    for (var e in err) {
        if (err.hasOwnProperty(e)) {
            data[e] = String(err[e]);
        }
    }
    logger.error("requirejs load error", data);
};

var hmacSha256 = require("crypto-js/hmac-sha256");
var gamma = require("gamma");
var numeric = require("numeric");
var child_process = require("child_process");
var PrairieStats = requirejs("PrairieStats");
var PrairieModel = requirejs("PrairieModel");
var PrairieRole = requirejs("PrairieRole");
var express = require("express");
var https = require('https');
var app = express();

var SAMPLE_INTERVAL = 60 * 1000; // ms
var nSample = 0;

var STATS_INTERVAL = 10 * 60 * 1000; // ms

app.use(express.json());

var db, countersCollect, uCollect, sCollect, qiCollect, statsCollect, tCollect, tiCollect, accessCollect, commitCollect;

var MongoClient = require('mongodb').MongoClient;

var newID = function(type, callback) {
    var query = {_id: type};
    var sort = [['_id', 1]];
    var doc = {$inc: {seq: 1}};
    countersCollect.findAndModify(query, sort, doc, {w: 1, new: true}, function(err, item) {
        if (err) return callback(err);
        var id = type.slice(0, type.length - 2) + item.value.seq;
        callback(null, id);
    });
};

var newIDNoError = function(req, res, type, callback) {
    newID(type, function(err, id) {
        if (err) return sendError(res, 500, "Error getting new ID of type " + type, err);
        callback(id);
    });
};

var processCollection = function(name, err, collection, options, callback) {
    if (err) {
        logger.error("unable to fetch '" + name + "' collection", err);
        callback(true);
        return;
    }
    logger.info("successfully fetched '" + name + "' collection");
    var tasks = [];
    if (options.indexes) {
        _(options.indexes).each(function(index) {
            tasks.push(function(cb) {
                collection.ensureIndex(index.keys, index.options, function(err, indexName) {
                    if (err) {
                        logger.error("unable to create index on '" + name + "' collection", index, err);
                        return cb(err);
                    }
                    logger.info("have '" + name + "' index: " + indexName);
                    cb(null);
                });
            });
        });
    }
    if (options.idPrefix) {
        tasks.push(function(cb) {
            var idName = options.idPrefix + "id";
            countersCollect.update({_id: idName}, {$setOnInsert: {seq: 0}}, {w: 1, upsert: true}, function(err, result) {
                if (err) {
                    logger.error("unable to create counter for " + idName, index, err);
                    return cb(err);
                }
                logger.info("have counter for " + idName);
                cb(null);
            });
        });
    }

    async.series(tasks, function(err, results) {
        if (err) return callback(err);
        callback(null);
    });
};

var loadDB = function(callback) {
    MongoClient.connect(config.dbAddress, function(err, locDb) {
        if (err) {
            logger.error("unable to connect to database at address: " + config.dbAddress, err);
            callback(true);
            return;
        }
        logger.info("successfully connected to database");
        db = locDb;
        async.series([
            function(cb) {
                db.collection('counters', function(err, collection) {
                    countersCollect = collection;
                    var options = {};
                    processCollection('counters', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('users', function(err, collection) {
                    uCollect = collection;
                    var options = {
                        indexes: [
                            {keys: {uid: 1}, options: {unique: true}},
                        ],
                    };
                    processCollection('users', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('submissions', function(err, collection) {
                    sCollect = collection;
                    var options = {
                        idPrefix: "s",
                        indexes: [
                            {keys: {sid: 1}, options: {unique: true}},
                            {keys: {uid: 1}, options: {}},
                        ],
                    };
                    processCollection('submissions', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('qInstances', function(err, collection) {
                    qiCollect = collection;
                    var options = {
                        idPrefix: "qi",
                        indexes: [
                            {keys: {qiid: 1}, options: {unique: true}},
                            {keys: {uid: 1}, options: {}},
                        ],
                    };
                    processCollection('qInstances', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('statistics', function(err, collection) {
                    statsCollect = collection;
                    var options = {};
                    processCollection('statistics', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('tests', function(err, collection) {
                    tCollect = collection;
                    var options = {
                        indexes: [
                            {keys: {tid: 1}, options: {unique: true}},
                        ],
                    };
                    processCollection('tests', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('tInstances', function(err, collection) {
                    tiCollect = collection;
                    var options = {
                        idPrefix: "ti",
                        indexes: [
                            {keys: {tiid: 1}, options: {unique: true}},
                            {keys: {uid: 1}, options: {}},
                        ],
                    };
                    processCollection('tInstances', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('accesses', function(err, collection) {
                    accessCollect = collection;
                    var options = {};
                    processCollection('accesses', err, collection, options, cb);
                });
            },
            function(cb) {
                db.collection('commits', function(err, collection) {
                    commitCollect = collection;
                    var options = {
                        idPrefix: "m",
                        indexes: [
                            {keys: {mid: 1}, options: {unique: true}},
                            {keys: {commitHash: 1}, options: {}},
                        ],
                    };
                    processCollection('commits', err, collection, options, cb);
                });
            },
        ], function(err) {
            if (err) {
                logger.error("Error loading DB collections");
                callback(true);
            } else {
                logger.info("Successfully loaded all DB collections");
                callback(null);
            }
        });
    });
};

var courseInfo = {};

var loadCourseInfo = function(callback) {
    var courseInfoFilename = path.join(config.courseDir, "courseInfo.json");
    readInfoJSON(courseInfoFilename, "schemas/courseInfo.json", undefined, undefined, function(err, info) {
        if (err) return callback(err);
        courseInfo.name = info.name;
        courseInfo.title = info.title;
        if (info.userRoles) {
            _(info.userRoles).forEach(function(value, key) {
                // only add new role if role doesn't currently exist, so we can't overwrite superusers
                if (!config.roles[key]) {
                    config.roles[key] = value;
                }
            });
        }
        return callback(null);
    });
};

var questionDB = {};
var testDB = {};

var loadInfoDB = function(db, idName, parentDir, defaultInfo, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, loadCallback) {
    fs.readdir(parentDir, function(err, files) {
        if (err) {
            logger.error("unable to read info directory: " + parentDir, err);
            loadCallback(true);
            return;
        }

        async.filter(files, function(dirName, cb) {
            // Filter out files from questions/ as it is possible they slip in without the user putting them there (like .DS_Store).
            var filePath = path.join(parentDir, dirName);
            fs.lstat(filePath, function(err, fileStats){
                cb(fileStats.isDirectory());
            });
        }, function(folders) {
            async.each(folders, function(dir, callback) {
                var infoFile = path.join(parentDir, dir, "info.json");
                readInfoJSON(infoFile, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, function(err, info) {
                    if (err) {
                        logger.error("Error reading file: " + infoFile, err);
                        callback(null);
                        return;
                    }
                    if (info.disabled) {
                        callback(null);
                        return;
                    }
                    info = _.defaults(info, defaultInfo);
                    info[idName] = dir;
                    db[dir] = info;
                    return callback(null);
                });
            }, function(err) {
                if (err) {
                    logger.error("Error reading data", err);
                    loadCallback(err);
                    return;
                }
                logger.info("successfully loaded info from " + parentDir + ", number of items = " + _.size(db));
                loadCallback();
            });
        });
    });
};

var initTestData = function(callback) {
    async.each(_(testDB).values(), function(item, cb) {
        tCollect.findOne({tid: item.tid}, function(err, obj) {
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
                tCollect.update({tid: item.tid}, {$set: obj}, {upsert: true, w: 1}, function(err) {
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
    logger.error("returning error", {code: code, msg: msg, err: err});
    if (res._header) {
        // response was already sent
        logger.error("response was already send, bailing out early");
        return;
    }
    res.send(code, msg);
};

var isDateBeforeNow = function(dateString) {
    return moment.tz(dateString, config.timezone).isBefore(); // isBefore() uses NOW with no arg
};

var isDateAfterNow = function(dateString) {
    return moment.tz(dateString, config.timezone).isAfter(); // isBefore() uses NOW with no arg
};

var checkTestAccessRule = function(req, tid, accessRule) {
    // AND all the accessRule tests together
    var avail = true;
    _(accessRule).each(function(value, key) {
        if (key === "mode") {
            if (req.mode != value)
                avail = false;
        } else if (key == "role") {
            if (!PrairieRole.isAsPowerful(req.userRole, value))
                avail = false;
        } else if (key === "startDate") {
            if (!isDateBeforeNow(value))
                avail = false;
        } else if (key === "endDate") {
            if (!isDateAfterNow(value))
                avail = false;
        } else {
            avail = false;
        }
    });
};

var checkTestAvail = function(req, tid) {
    var avail = false;
    if (PrairieRole.hasPermission(req.userRole, 'bypassAccess')) {
        avail = true;
    }
    if (_(testDB).has(tid)) {
        var info = testDB[tid];
        if (info.allowAccess === undefined) {
            avail = true;
        } else {
            // OR the accessRules
            _(info.allowAccess).each(function(accessRule) {
                if (checkTestAccessRule(req, accessRule)) {
                    avail = true;
                }
            });
        }
    }
    return avail;
};

var filterTestsByAvail = function(req, tests, callback) {
    async.filter(tests, function(test, objCallback) {
        objCallback(checkTestAvail(req, test.tid));
    }, callback);
};

var ensureTestAvailByTID = function(req, res, tid, callback) {
    if (checkTestAvail(req, tid)) {
        callback(tid);
    } else {
        return sendError(res, 403, "Test TID " + tid + " not available: " + req.path);
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

var ensureObjAuth = function(req, res, obj, operation, callback) {
    if (checkObjAuth(req, obj, operation)) {
        callback(obj);
    } else {
        return sendError(res, 403, "Insufficient permissions for operation " + operation + ": " + req.path);
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

    // hack due to RequireJS not providing header support
    if (/^\/questions/.test(req.path)) {
        req.authUID = "nouser";
        next();
        return;
    }
    if (/^\/clientCode/.test(req.path)) {
        req.authUID = "nouser";
        next();
        return;
    }

    // bypass auth for local file serving
    if (config.localFileserver) {
        if (req.path == "/"
            || req.path == "/index.html"
            || req.path == "/config.js"
            || /^\/require\//.test(req.path)
            || /^\/css\//.test(req.path)
            || /^\/text\//.test(req.path)
            || /^\/img\//.test(req.path)
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
    
    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }
    if (config.authType == 'eppn') {
        req.authUID = req.headers['eppn'];

        // FIXME: we need to figure out what headers are being passed with eppn auth
        req.authRole = uidToRole(req.authUID);
        req.mode = 'Default';
        req.userUID = req.authUID;
        req.userRole = req.authRole;
    } else if (config.authType == 'x-auth' || config.authType === 'none') {
        if (req.headers['x-auth-uid'] == null) {
            return sendError(res, 403, "Missing X-Auth-UID header");
        }
        if (req.headers['x-auth-name'] == null) {
            return sendError(res, 403, "Missing X-Auth-Name header");
        }
        if (req.headers['x-auth-date'] == null) {
            return sendError(res, 403, "Missing X-Auth-Date header");
        }
        if (req.headers['x-auth-signature'] == null) {
            return sendError(res, 403, "Missing X-Auth-Signature header");
        }
        if (req.headers['x-mode'] == null) {
            return sendError(res, 403, "Missing X-Mode header");
        }
        if (req.headers['x-user-uid'] == null) {
            return sendError(res, 403, "Missing X-User-UID header");
        }
        if (req.headers['x-user-role'] == null) {
            return sendError(res, 403, "Missing X-User-Role header");
        }
        var authUID = req.headers['x-auth-uid'].toLowerCase();
        var authRole = uidToRole(authUID);
        var authName = req.headers['x-auth-name'];
        var authDate = req.headers['x-auth-date'];
        var authSignature = req.headers['x-auth-signature'];
        var checkData = authUID + "/" + authName + "/" + authDate;
        var checkSignature = hmacSha256(checkData, config.secretKey).toString();
        if (authSignature !== checkSignature) {
            return sendError(res, 403, "Invalid X-Auth-Signature for " + authUID);
        }

        // authorization succeeded, store data in the request
        req.authUID = authUID;
        req.authRole = authRole;
        req.mode = req.headers['x-mode'];
        req.userUID = req.headers['x-user-uid'].toLowerCase();
        req.userRole = req.headers['x-user-role'];
    } else {
        return sendError(res, 500, "Invalid authType: " + config.authType);
    }

    // make sure userRole is not more powerful than authRole
    req.userRole = PrairieRole.leastPermissive(req.userRole, req.authRole);
    
    // make sure only authorized users can change UID
    if (!PrairieRole.hasPermission(req.authRole, 'viewOtherUsers')) {
        req.userUID = req.authUID;
    }

    // make sure only authorized users can change mode
    var serverMode = 'Public'; // FIXME: determine from client IP
    if (req.mode == 'Default' || !PrairieRole.hasPermission(req.authRole, 'changeMode')) {
        req.mode = serverMode;
    }
    
    // add authUID to DB if not already present
    uCollect.findOne({uid: req.authUID}, function(err, uObj) {
        if (err) {
            return sendError(res, 500, "error checking for user: " + req.authUID, err);
        }
        if (!uObj) {
            uCollect.insert({uid: req.authUID, name: req.authName}, {w: 1}, function(err) {
                if (err) {
                    return sendError(res, 500, "error adding user: " + req.authUID, err);
                }
                next();
            });
        } else {
            next();
        }
    });
});

app.use(function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        var access = {
            timestamp: (new Date()).toISOString(),
            ip: req.ip,
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
        if (accessCollect) {
            accessCollect.insert(access);
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

app.get("/course", function(req, res) {
    res.json({name: courseInfo.name, title: courseInfo.title});
});

var getCourseCommitFromDisk = function(callback) {
    var cmd = 'git';
    var options = [
        'show',
        '-s',
        '--format=subject:%s%ncommitHash:%H%nrefNames:%D%nauthorName:%an%nauthorEmail:%ae%nauthorDate:%aI%ncommitterName:%cn%ncommitterEmail:%ce%ncommitterDate:%cI',
        'HEAD'
    ];
    var env = {
        'timeout': 5000, // milliseconds
        'cwd': config.courseDir,
    };
    child_process.execFile(cmd, options, env, function(err, stdout, stderr) {
        if (err) {
            return callback(err);
        }
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
            return callback(Error('Invalid or missing commitHash from "git show"'),
                            {cmd: cmd, options: options, env: env, stdout: stdout});
        }
        callback(null, commit);
    });
};

var ensureDiskCommitInDB = function(callback) {
    getCourseCommitFromDisk(function(err, commit) {
        if (err) return callback(err);
        commitCollect.findOne({commitHash: commit.commitHash}, function(err, obj) {
            if (err) return callback(err);
            if (obj) return callback(null);
            commit.createSource = 'External';
            commit.createDate = (new Date()).toISOString();
            commit.createUID = '';
            newID('mid', function(err, mid) {
                if (err) return callback(err);
                commit.mid = mid;
                commitCollect.insert(commit, {w: 1}, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    });
};

app.get("/courseCommits", function(req, res) {
    if (!PrairieRole.hasPermission(req.userRole, 'viewCourseCommits')) {
        return sendError(res, 403, "Insufficient permissions to access.");
    }
    ensureDiskCommitInDB(function(err) {
        if (err) return sendError(res, 500, "Error mapping disk commit to DB", err);
        commitCollect.find({}, function(err, cursor) {
            if (err) return sendError(res, 500, "Error accessing database", err);
            cursor.toArray(function(err, objs) {
                if (err) return sendError(res, 500, "Error serializing", err);
                async.map(objs, function(o, callback) {
                    callback(null, {
                        mid: o.mid,
                        createDate: o.createDate,
                        createUID: o.createUID,
                        createSource: o.createSource,
                        subject: o.subject,
                        commitHash: o.commitHash,
                        refNames: o.refNames,
                        authorName: o.authorName,
                        authorEmail: o.authorEmail,
                        authorDate: o.authorDate,
                        committerName: o.committerName,
                        committerEmail: o.committerEmail,
                        committerDate: o.committerDate,
                    });
                }, function(err, objs) {
                    if (err) return sendError(res, 500, "Error cleaning objects", err);
                    res.json(objs);
                });
            });
        });
    });
});


app.get("/questions", function(req, res) {
    async.map(_.values(questionDB), function(item, callback) {
        callback(null, {qid: item.qid, title: item.title, number: item.number});
    }, function(err, results) {
        res.json(stripPrivateFields(results));
    });
});

app.get("/questions/:qid", function(req, res) {
    var info = questionDB[req.params.qid];
    if (info === undefined)
        return sendError(res, 404, "No such question: " + req.params.qid);
    res.json(stripPrivateFields({qid: info.qid, title: info.title, number: info.number, video: info.video}));
});

var questionFilePath = function(qid, filename, callback, nTemplates) {
    nTemplates = (nTemplates === undefined) ? 0 : nTemplates;
    if (nTemplates > 10) {
        return callback("Too-long template recursion for qid: " + qid);
    }
    var info = questionDB[qid];
    if (info === undefined) {
        return callback("QID not found in questionDB: " + qid);
    }
    var filePath = path.join(qid, filename);
    var fullFilePath = path.join(config.questionsDir, filePath);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            // couldn't find the file
            if (info.template !== undefined) {
                // have a template, try it
                return questionFilePath(info.template, filename, callback, nTemplates + 1);
            } else {
                // no template, try default files
                var filenameToSuffix = {
                    "client.js": 'Client.js',
                    "server.js": 'Server.js',
                };
                if (filenameToSuffix[filename] === undefined) {
                    return callback("file not found: " + fullFilePath);
                }
                var defaultFilename = info.type + filenameToSuffix[filename];
                var fullDefaultFilePath = path.join(config.questionDefaultsDir, defaultFilename);
                fs.stat(fullDefaultFilePath, function(err, stats) {
                    if (err) {
                        // no default file, give up
                        return callback("file not found: " + fullFilePath);
                    }
                    // found a default file
                    return callback(null, {filePath: defaultFilename, qid: qid, filename: filename, root: config.questionDefaultsDir});
                });
            }
        } else {
            // found the file
            return callback(null, {filePath: filePath, qid: qid, filename: filename, root: config.questionsDir});
        }
    });
};

var sendQuestionFile = function(req, res, filename) {
    questionFilePath(req.params.qid, filename, function(err, fileInfo) {
        if (err)
            return sendError(res, 404, "No such file '" + filename + "' for qid: " + req.params.qid, err);
        info = questionDB[fileInfo.qid];
        if (info === undefined) {
            return sendError(res, 404, "No such qid: " + fileInfo.qid);
        }
        if (!_(info).has("clientFiles")) {
            return sendError(res, 500, "Question does not have clientFiles, qid: " + fileInfo.qid);
        }
        if (!_(info.clientFiles).contains(fileInfo.filename)) {
            return sendError(res, 404, "Access denied to '" + fileInfo.filename + "' for qid: " + fileInfo.qid);
        }
        res.sendfile(fileInfo.filePath, {root: fileInfo.root});
    });
};

app.get("/questions/:qid/:filename", function(req, res) {
    sendQuestionFile(req, res, req.params.filename);
});

app.get("/clientCode/:filename", function(req, res) {
    var fullFilePath = path.join(config.clientCodeDir, req.params.filename);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            return sendError(res, 404, 'No such file "/clientCode/' + req.params.filename + '"', err);
        }
        res.sendfile(req.params.filename, {root: config.clientCodeDir});
    });
});

app.get("/users", function(req, res) {
    if (!uCollect) {
        return sendError(res, 500, "Do not have access to the users database collection");
    }
    uCollect.find({}, {"uid": 1, "name": 1}, function(err, cursor) {
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
    if (!uCollect) {
        return sendError(res, 500, "Do not have access to the users database collection");
    }
    uCollect.findOne({uid: req.params.uid}, function(err, uObj) {
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
        ensureObjAuth(req, res, obj, "read", function(obj) {
            res.json(stripPrivateFields(obj));
        });
    });
});

app.get("/qInstances", function(req, res) {
    if (!qiCollect) {
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
    qiCollect.find(query, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing qInstances database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing qInstances", err);
            }
            filterObjsByAuth(req, objs, "read", function(objs) {
                res.json(stripPrivateFields(objs));
            });
        });
    });
});

app.get("/qInstances/:qiid", function(req, res) {
    if (!qiCollect) {
        return sendError(res, 500, "Do not have access to the qInstances database collection");
    }
    qiCollect.findOne({qiid: req.params.qiid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing qInstances database for qiid " + req.params.qiid, err);
        }
        if (!obj) {
            return sendError(res, 404, "No qInstance with qiid " + req.params.qiid);
        }
        ensureObjAuth(req, res, obj, "read", function(obj) {
            res.json(stripPrivateFields(obj));
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
    if (qInstance.tiid === undefined) {
        return sendError(res, 400, "No tInstance ID provided");
    }
    qInstance.date = new Date();
    var info = questionDB[qInstance.qid];
    if (info === undefined) {
        return sendError(res, 400, "Invalid QID: " + qInstance.qid);
    }
    if (!_.isString(qInstance.vid) || qInstance.vid.length === 0) {
        qInstance.vid = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
    }
    ensureObjAuth(req, res, qInstance, "write", function(qInstance) {
        newIDNoError(req, res, "qiid", function(qiid) {
            qInstance.qiid = qiid;
            loadQuestionServer(qInstance.qid, function (server) {
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
                qiCollect.insert(qInstance, {w: 1}, function(err) {
                    if (err) {
                        return sendError(res, 500, "Error writing qInstance to database", err);
                    }
                    return callback(qInstance);
                });
            });
        });
    });
};

app.post("/qInstances", function(req, res) {
    var qInstance = {
        uid: req.body.uid,
        qid: req.body.qid,
        tiid: req.body.tiid,
    };
    if (PrairieRole.hasPermission(req.userRole, 'overrideVID') && _(req.body).has('vid')) {
        qInstance.vid = req.body.vid;
    };
    readTInstance(res, qInstance.tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, "read", function(tInstance) {
            makeQInstance(req, res, qInstance, function(qInstance) {
                res.json(stripPrivateFields(qInstance));
            });
        });
    });
});

app.get("/submissions", function(req, res) {
    if (!sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    var query = {};
    if ("uid" in req.query) {
        query.uid = req.query.uid;
    }
    if ("qid" in req.query) {
        query.qid = req.query.qid;
    }
    sCollect.find(query, function(err, cursor) {
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
    if (!sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    sCollect.findOne({sid: req.params.sid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing submissions database for sid " + req.params.sid, err);
        }
        if (!obj) {
            return sendError(res, 404, "No submission with sid " + req.params.sid);
        }
        ensureObjAuth(req, res, obj, "read", function(obj) {
            res.json(stripPrivateFields(obj));
        });
    });
});

var deepClone = function(obj) {
    return JSON.parse(JSON.stringify(obj));
};

var readTInstance = function(res, tiid, callback) {
    tiCollect.findOne({tiid: tiid}, function(err, obj) {
        if (err)
            return sendError(res, 500, "Error accessing tInstance database", {tiid: tiid, err: err});
        if (!obj)
            return sendError(res, 404, "No tInstance with tiid " + tiid, {tiid: tiid, err: err});
        return callback(obj);
    });
};

var readQInstance = function(res, qiid, callback) {
    qiCollect.findOne({qiid: qiid}, function(err, obj) {
        if (err)
            return sendError(res, 500, "Error accessing qInstance database", {qiid: qiid, err: err});
        if (!obj)
            return sendError(res, 404, "No qInstance with qiid " + qiid, {qiid: qiid, err: err});
        return callback(obj);
    });
};

var loadQuestionServer = function(qid, callback) {
    questionFilePath(qid, "server.js", function(err, fileInfo) {
        if (err)
            return sendError(res, 404, "Unable to find 'server.js' for qid: " + qid, err);
        var serverFilePath = path.join(fileInfo.root, fileInfo.filePath);
        requirejs([serverFilePath], function(server) {
            if (server === undefined)
                return sendError("Unable to load 'server.js' for qid: " + qid);
            return callback(server);
        });
    });
};

var readTest = function(res, tid, callback) {
    tCollect.findOne({tid: tid}, function(err, obj) {
        if (err)
            return sendError(res, 500, "Error accessing tests database", {tid: tid, err: err});
        if (!obj)
            return sendError(res, 404, "No test with tid " + tid, {tid: tid, err: err});
        return callback(obj);
    });
};

var loadTestServer = function(tid, callback) {
    var info = testDB[tid];
    var testType = info.type;
    var serverFile = testType + "TestServer.js";
    requirejs([serverFile], function(server) {
        return callback(server);
    });
};

var writeTInstance = function(req, res, obj, callback) {
    if (obj.tiid === undefined)
        return sendError(res, 500, "No tiid for write to tInstance database", {tInstance: obj});
    if (obj._id !== undefined)
        delete obj._id;
    ensureObjAuth(req, res, obj, "write", function(obj) {
        tiCollect.update({tiid: obj.tiid}, {$set: obj}, {upsert: true, w: 1}, function(err) {
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
    tCollect.update({tid: obj.tid}, {$set: obj}, {upsert: true, w: 1}, function(err) {
        if (err)
            return sendError(res, 500, "Error writing test to database", {test: obj, err: err});
        return callback();
    });
};

var testProcessSubmission = function(req, res, tiid, submission, callback) {
    readTInstance(res, tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, "read", function(tInstance) {
            var tid = tInstance.tid;
            readTest(res, tid, function(test) {
                loadTestServer(tid, function(server) {
                    var uid = submission.uid;
                    try {
                        server.updateWithSubmission(tInstance, test, submission, testDB[tid].options);
                    } catch (e) {
                        return sendError(res, 500, "Error updating test: " + String(e), {err: e, stack: e.stack});
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
};

app.post("/submissions", function(req, res) {
    if (!sCollect) {
        return sendError(res, 500, "Do not have access to the submissions database collection");
    }
    if (!uCollect) {
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
    ensureObjAuth(req, res, submission, "write", function(submission) {
        readQInstance(res, submission.qiid, function(qInstance) {
            ensureObjAuth(req, res, qInstance, "read", function(qInstance) {
                submission.qid = qInstance.qid;
                submission.vid = qInstance.vid;
                var tiid = qInstance.tiid;
                var info = questionDB[submission.qid];
                if (info === undefined) {
                    return sendError(res, 404, "No such QID: " + submission.qid);
                }
                var options = info.options || {};
                options = _.defaults(options, qInstance.options || {});
                loadQuestionServer(submission.qid, function (server) {
                    if (submission.overrideScore !== undefined) {
                        submission.score = submission.overrideScore;
                    } else {
                        var grading;
                        try {
                            grading = server.gradeAnswer(qInstance.vid, qInstance.params, qInstance.trueAnswer, submission.submittedAnswer, options);
                        } catch (e) {
                            return sendError(res, 500, "Error in " + submission.qid + " gradeAnswer(): " + e.toString(), {stack: e.stack});
                        }
                        submission.score = _.isNumber(grading.score) ? grading.score : 0; // make sure score is a Number
                        submission.score = Math.max(0, Math.min(1, submission.score)); // clip to [0, 1]
                        if (grading.feedback)
                            submission.feedback = grading.feedback;
                    }
                    submission.trueAnswer = qInstance.trueAnswer;
                    newIDNoError(req, res, "sid", function(sid) {
                        submission.sid = sid;
                        testProcessSubmission(req, res, tiid, submission, function(submission) {
                            sCollect.insert(submission, {w: 1}, function(err) {
                                if (err) {
                                    return sendError(res, 500, "Error writing submission to database", err);
                                }
                                res.json(stripPrivateFields(submission));
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get("/tests", function(req, res) {
    if (!tCollect) {
        return sendError(res, 500, "Do not have access to the tCollect database collection");
    }
    tCollect.find({}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tCollect database", err);
        }
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing tests", err);
            }
            objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
            filterTestsByAvail(req, objs, function(objs) {
                res.json(stripPrivateFields(objs));
            });
        });
    });
});

app.get("/tests/:tid", function(req, res) {
    if (!tCollect) {
        return sendError(res, 500, "Do not have access to the tCollect database collection");
    }
    tCollect.findOne({tid: req.params.tid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing tCollect database for tid " + req.params.tid, err);
        }
        if (!obj) {
            return sendError(res, 404, "No test with tid " + req.params.tid);
        }
        ensureTestAvailByTID(req, res, obj.tid, function() {
            res.json(stripPrivateFields(obj));
        });
    });
});

app.get("/tests/:tid/client.js", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function() {
        var filePath = path.join(req.params.tid, "client.js");
        res.sendfile(filePath, {root: config.testsDir});
    });
});

app.get("/tests/:tid/common.js", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function() {
        var filePath = path.join(req.params.tid, "common.js");
        res.sendfile(filePath, {root: config.testsDir});
    });
});

app.get("/tests/:tid/test.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function() {
        var filePath = path.join(req.params.tid, "test.html");
        res.sendfile(filePath, {root: config.testsDir});
    });
});

app.get("/tests/:tid/testOverview.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function() {
        var filePath = path.join(req.params.tid, "testOverview.html");
        res.sendfile(filePath, {root: config.testsDir});
    });
});

app.get("/tests/:tid/testSidebar.html", function(req, res) {
    ensureTestAvailByTID(req, res, req.params.tid, function() {
        var filePath = path.join(req.params.tid, "testSidebar.html");
        res.sendfile(filePath, {root: config.testsDir});
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
    server.updateTInstance(tInstance, test, test.options);
    autoCreateTestQuestions(req, res, tInstance, test, function() {
        callback();
    });
};

var updateTInstances = function(req, res, tInstances, updateCallback) {
    async.each(tInstances, function(tInstance, callback) {
        var tid = tInstance.tid;
        readTest(res, tid, function(test) {
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
    async.each(_(testDB).values(), function(test, callback) {
        var tid = test.tid;
        if (checkTestAvail(req, tid) && test.options.autoCreate && tiDB[tid] === undefined && req.query.uid !== undefined) {
            readTest(res, tid, function(test) {
                loadTestServer(tid, function(server) {
                    newIDNoError(req, res, "tiid", function(tiid) {
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

app.get("/tInstances", function(req, res) {
    if (!tiCollect) {
        return sendError(res, 500, "Do not have access to the tiCollect database collection");
    }
    var query = {};
    if ("uid" in req.query) {
        query.uid = req.query.uid;
    }
    tiCollect.find(query, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        cursor.toArray(function(err, tInstances) {
            if (err) {
                return sendError(res, 500, "Error serializing tInstances", err);
            }
            tInstances = _(tInstances).filter(function(ti) {return _(testDB).has(ti.tid);});
            filterObjsByAuth(req, tInstances, "read", function(tInstances) {
                updateTInstances(req, res, tInstances, function() {
                    autoCreateTInstances(req, res, tInstances, function(tInstances) {
                        filterObjsByAuth(req, tInstances, "read", function(tInstances) {
                            res.json(stripPrivateFields(tInstances));
                        });
                    });
                });
            });
        });
    });
});

app.get("/tInstances/:tiid", function(req, res) {
    if (!tiCollect) {
        return sendError(res, 500, "Do not have access to the tiCollect database collection");
    }
    tiCollect.findOne({tiid: req.params.tiid}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        if (!obj) {
            return sendError(res, 404, "No tInstance with tiid " + req.params.tiid);
        }
        ensureObjAuth(req, res, obj, "read", function(obj) {
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
    var testInfo = testDB[tid];
    if (testInfo === undefined) {
        return sendError(res, 400, "Invalid tid", {tid: tid});
    }
    if (testInfo.options.autoCreate) {
        return sendError(res, 400, "Test can only be autoCreated", {tid: tid});
    }
    tiCollect.find({tid: tid, uid: uid}, {"number": 1}, function(err, cursor) {
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

                readTest(res, tid, function(test) {
                    loadTestServer(tid, function(server) {
                        newIDNoError(req, res, "tiid", function(tiid) {
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
            }
        });
    });
});

var finishTest = function(req, res, tiid, callback) {
    readTInstance(res, tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, "write", function(tInstance) {
            var tid = tInstance.tid;
            readTest(res, tid, function(test) {
                loadTestServer(tid, function(server) {
                    try {
                        server.finish(tInstance, test);
                    } catch (e) {
                        return sendError(res, 500, "Error finishing test: " + String(e), {err: e, stack: e.stack});
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

var gradeTest = function(req, res, tiid, callback) {
    readTInstance(res, tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, "write", function(tInstance) {
            var tid = tInstance.tid;
            readTest(res, tid, function(test) {
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

app.get("/export.csv", function(req, res) {
    if (!tiCollect) {
        return sendError(res, 500, "Do not have access to the tiCollect database collection");
    }
    tiCollect.find({}, function(err, cursor) {
        if (err) {
            return sendError(res, 500, "Error accessing tiCollect database", err);
        }
        scores = {};
        cursor.each(function(err, item) {
            if (err) {
                return sendError(res, 400, "Error iterating over tInstances", {err: err});
            }
            if (item != null) {
                if (!checkObjAuth(req, item, "read"))
                    return;
                var tid = item.tid;
                var uid = item.uid;
                if (scores[uid] === undefined)
                    scores[uid] = {}
                if (scores[uid][tid] === undefined)
                    scores[uid][tid] = item.score;
                else
                    scores[uid][tid] = Math.max(scores[uid][tid], item.score);
            } else {
                // end of collection
                var tids = _(testDB).pluck('tid');
                tids.sort(function(tid1, tid2) {
                    var test1 = testDB[tid1] ? testDB[tid1] : {type: 'none', number: 0};
                    var test2 = testDB[tid2] ? testDB[tid2] : {type: 'none', number: 0};
                    if (test1.type === test2.type) {
                        return test1.number - test2.number;
                    } else {
                        return (test1.type < test2.type) ? -1 : 1;
                    }
                });
                titles = _(tids).map(function(tid) {return testDB[tid].type + testDB[tid].number;});
                headers = ["uid"].concat(titles);
                var csvData = [];
                _(_(scores).keys()).each(function(uid) {
                    var row = [uid];
                    _(tids).each(function(tid) {
                        if (_(scores[uid]).has(tid))
                            row.push(scores[uid][tid])
                        else
                            row.push("ABS");
                    });
                    csvData.push(row);
                });
                csvData = _(csvData).sortBy(function(row) {return row[0];});
                csvData.splice(0, 0, headers);
                var csv = _(csvData).map(function(row) {return row.join(",") + "\n";}).join("");
                res.attachment("export.csv");
                res.send(csv);
            }
        });
    });
});

app.get("/stats", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.find({}, {name: 1}, function(err, cursor) {
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
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "submissionsPerHour"}, function(err, obj) {
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
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "usersPerHour"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for usersPerHour", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for usersPerHour");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/errors", function(req, res) {
    if (PrairieRole.hasPermission(req.userRole, 'readErrors')) {
        res.json(errorList);
    } else {
        res.json([]);
    }
});

if (config.localFileserver) {
    app.get("/", function(req, res) {
        res.sendfile("index.html", {root: config.frontendDir});
    });

    app.get("/index.html", function(req, res) {
        res.sendfile("index.html", {root: config.frontendDir});
    });

    app.get("/config.js", function(req, res) {
        res.sendfile("config.js", {root: config.frontendDir});
    });

    app.get("/require/:filename", function(req, res) {
        res.sendfile(path.join("require", req.params.filename), {root: config.frontendDir});
    });

    app.get("/require/browser/:filename", function(req, res) {
        res.sendfile(path.join("require", "browser", req.params.filename), {root: config.frontendDir});
    });

    app.get("/css/:filename", function(req, res) {
        res.sendfile(path.join("css", req.params.filename), {root: config.frontendDir});
    });

    app.get("/text/:filename", function(req, res) {
        res.sendfile(path.join("text", req.params.filename), {root: config.frontendDir});
    });

    app.get("/img/:filename", function(req, res) {
        res.sendfile(path.join("img", req.params.filename), {root: config.frontendDir});
    });
}

var submissionsPerHour = function() {
    if (!sCollect) {
        logger.error("Do not have access to the 'submissions' database collection");
        return;
    }
    if (!statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    sCollect.find({}, {"date": 1, "uid": 1}, function(err, cursor) {
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
                statsCollect.update({name: "submissionsPerHour"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'submissionsPerHour' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var usersPerHour = function() {
    if (!sCollect) {
        logger.error("Do not have access to the 'submissions' database collection");
        return;
    }
    if (!statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    sCollect.find({}, {"date": 1, "uid": 1}, function(err, cursor) {
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
                statsCollect.update({name: "usersPerHour"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
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
    async.eachSeries(_.values(questionDB), function(question, cb) {
        question.dist = new PrairieModel.QuestionDist(question.qid);
        cb(null);
    }, callback);
};

var loadUserDB = function(callback) {
    uCollect.find({}, {"uid": 1}, function(err, cursor) {
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
    var question = questionDB[qid];
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

    //if (uid === "tableri2@illinois.edu")
    //    console.log(iSubmission, user.dist.sigma.mean[0], user.dist.sigma.covariance[0][0]);
};

var processSubmissionsBayes = function(callback) {
    sCollect.find({}, function(err, cursor) {
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
    async.eachSeries(_.values(questionDB), function(question, cb) {
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

async.series([
    function(callback) {
        loadCourseInfo(callback);
    },
    function(callback) {
        var defaultQuestionInfo = {
            "type": "Calculation",
            "clientFiles": ["client.js", "question.html", "answer.html"],
        };
        loadInfoDB(questionDB, "qid", config.questionsDir, defaultQuestionInfo, "schemas/questionInfo.json", "schemas/questionOptions", ".json", callback);
    },
    function(callback) {
        var defaultTestInfo = {
        };
        loadInfoDB(testDB, "tid", config.testsDir, defaultTestInfo, "schemas/testInfo.json", "schemas/testOptions", ".json", callback);
    },
    loadDB,
    initTestData,
    //runBayes,
    /*
    function(callback) {
        computeStats();
        callback(null);
    },
    */
    startServer,
    startIntervalJobs
], function(err) {
    if (err) {
        logger.error("Error initializing PrairieLearn server, exiting...", err);
        process.exit(1);
    } else {
        logger.transports.console.level = 'info';
        logger.info("PrairieLearn server ready");
        logger.transports.console.level = 'warn';
    }
});
