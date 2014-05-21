console.log("Starting PrairieLearn server...");

var DEPLOY_MODE = 'local';
if (process.argv.length > 2) {
    if (process.argv[2] === "deploy") {
        DEPLOY_MODE = 'engr';

        console.log("Starting nodetime...");
        require('nodetime').profile({
            accountKey: 'SECRET_NODETIME_KEY',
            appName: 'Node.js Application'
        });
        console.log("nodetime started");
    }
}
if (process.env.C9_USER != null) {
    DEPLOY_MODE = 'c9';
}

if (DEPLOY_MODE === 'c9') {
    var questionsDir = "backend/questions";
    var testsDir = "backend/tests";
    var frontendDir = "frontend";
} else {
    var questionsDir = "questions";
    var testsDir = "tests";
    var frontendDir = "../frontend";
}

var requirejs = require("requirejs");

requirejs.config({
    nodeRequire: require,
    baseUrl: frontendDir + '/require',
});

var logFilename;
if (DEPLOY_MODE === 'engr') {
    logFilename = '/var/log/apiserver.log';
} else {
    logFilename = 'server.log';
}

var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({level: 'warn', timestamp: true, colorize: true}),
        new (winston.transports.File)({filename: logFilename, level: 'info'})
    ]
});
logger.info('server start');

requirejs.onError = function(err) {
    var data = {errorMsg: err.toString()};
    for (var e in err) {
        if (err.hasOwnProperty(e)) {
            data[e] = String(err[e]);
        }
    }
    logger.error("requirejs load error", data);
};

var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var async = require("async");
var hmacSha256 = require("crypto-js/hmac-sha256");
var gamma = require("gamma");
var numeric = require("numeric");
var PrairieStats = requirejs("PrairieStats");
var PrairieModel = requirejs("PrairieModel");

var express = require("express");
var https = require('https');
var app = express();

var SAMPLE_INTERVAL = 60 * 1000; // ms
var nSample = 0;

var STATS_INTERVAL = 10 * 60 * 1000; // ms

var skipUIDs = {};
if (DEPLOY_MODE === 'engr') {
    skipUIDs["user1@illinois.edu"] = true;
    skipUIDs["mwest@illinois.edu"] = true;
    skipUIDs["zilles@illinois.edu"] = true;
    skipUIDs["dullerud@illinois.edu"] = true;
    skipUIDs["tomkin@illinois.edu"] = true;
    skipUIDs["ertekin@illinois.edu"] = true;
    skipUIDs["jkrehbi2@illinois.edu"] = true;
    skipUIDs["aandrsn3@illinois.edu"] = true;
    skipUIDs["farooq1@illinois.edu"] = true;
    skipUIDs["jsandrs2@illinois.edu"] = true;
    skipUIDs["knguyen9@illinois.edu"] = true;
    skipUIDs["linguo2@illinois.edu"] = true;
    skipUIDs["saggrwl3@illinois.edu"] = true;
    skipUIDs["hwang158@illinois.edu"] = true;
    skipUIDs["mfsilva@illinois.edu"] = true;
    skipUIDs["gladish2@illinois.edu"] = true;
    skipUIDs["ffxiao2@illinois.edu"] = true;
}

var superusers = {
    "user1@illinois.edu": true,
    "mwest@illinois.edu": true
};

app.use(express.json());

var db, countersCollect, uCollect, sCollect, qiCollect, statsCollect, tCollect, tiCollect;

var MongoClient = require('mongodb').MongoClient;

var newID = function(type, callback) {
    var query = {_id: type};
    var sort = [['_id', 1]];
    var doc = {$inc: {seq: 1}};
    countersCollect.findAndModify(query, sort, doc, {w: 1, new: true}, function(err, item) {
        if (err) return callback(err);
        var id = type.slice(0, type.length - 2) + item.seq;
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
    var dbAddress;
    switch (DEPLOY_MODE) {
    case 'engr': dbAddress = "mongodb://prairielearn3.engr.illinois.edu:27017/data"; break;
    case 'c9': dbAddress = "mongodb://" + process.env.IP + ":27017/data"; break;
    default: dbAddress = "mongodb://localhost:27017/data"; break;
    }
    MongoClient.connect(dbAddress, function(err, locDb) {
        if (err) {
            logger.error("unable to connect to database", err);
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

var questionDB = {};
var testDB = {};

var loadInfoDB = function(db, idName, parentDir, loadCallback) {
    fs.readdir(parentDir, function(err, files) {
        if (err) {
            logger.error("unable to read info directory: " + parentDir, err);
            loadCallback(true);
            return;
        }
        async.each(files, function(dir, callback) {
            var infoFile = path.join(parentDir, dir, "info.json");
            fs.readFile(infoFile, function(err, data) {
                if (err) {
                    logger.error("Unable to read file: " + infoFile, err);
                    callback(null);
                    return;
                }
                var info;
                try {
                    info = JSON.parse(data);
                } catch (e) {
                    logger.error("Error reading file: " + infoFile + ": " + e.name + ": " + e.message, e);
                    callback(null);
                    return;
                }
                if (info.disabled) {
                    callback(null);
                    return;
                }
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
            var serverFile = path.join(testsDir, item.tid, "server.js");
            requirejs([serverFile], function(server) {
                server.initTestData(obj);
                _.extend(obj, {
                    tid: item.tid, type: item.type, title: item.title, number: item.number
                });
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
    res.send(code, msg);
};

var checkObjAuth = function(req, obj) {
    var authorized = false;
    if (isSuperuser(req))
        authorized = true;
    if (obj.uid === req.authUID) {
        if (obj.availDate === undefined) {
            authorized = true;
        } else {
            if (Date.parse(obj.availDate) <= Date.now())
                authorized = true;
        }
    }
    return authorized;
};

var filterObjsByAuth = function(req, objs, callback) {
    async.filter(objs, function(obj, objCallback) {
        objCallback(checkObjAuth(req, obj));
    }, callback);
};

var ensureObjAuth = function(req, res, obj, callback) {
    if (checkObjAuth(req, obj)) {
        callback(obj);
    } else {
        return sendError(res, 403, "Insufficient permissions: " + req.path);
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
    // hack due to RequireJS not providing header support
    if (/^\/tests/.test(req.path)) {
        req.authUID = "nouser";
        next();
        return;
    }

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }
    if (DEPLOY_MODE !== 'engr') {
        // by-pass authentication for development
        req.authUID = "user1@illinois.edu";
    } else {
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
        var authUID = req.headers['x-auth-uid'];
        var authName = req.headers['x-auth-name'];
        var authDate = req.headers['x-auth-date'];
        var authSignature = req.headers['x-auth-signature'];
        var checkData = authUID + "/" + authName + "/" + authDate;
        var secretKey = "THIS_IS_THE_SECRET_KEY";
        var checkSignature = hmacSha256(checkData, secretKey);
        checkSignature = checkSignature.toString();
        if (authSignature !== checkSignature) {
            return sendError(res, 403, "Invalid X-Auth-Signature for " + authUID);
        }
        req.authUID = authUID;
    }

    // add authUID to DB if not already present
    uCollect.findOne({uid: req.authUID}, function(err, uObj) {
        if (err) {
            return sendError(res, 500, "error checking for user: " + req.authUID, err);
        }
        if (!uObj) {
            uCollect.insert({uid: req.authUID}, {w: 1}, function(err) {
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

var isSuperuser = function(req) {
    if (superusers[req.authUID] === true)
        return true;
    return false;
};

app.use(function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        logger.info("request",
                     {ip: req.ip,
                      authUID: req.authUID,
                      method: req.method,
                      path: req.path,
                      params: req.params,
                      body: req.body
                     });
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
if (DEPLOY_MODE !== 'engr') {
    app.get("/auth", function(req, res) {
        res.json(stripPrivateFields({
            "uid": "user1@illinois.edu",
            "name": "Test User",
            "date": "2013-08-17T09:44:18Z",
            "signature": "THIS_IS_THE_SECRET_SIGNATURE"
        }));
    });
}

app.get("/questions", function(req, res) {
    async.map(_.values(questionDB), function(item, callback) {
        callback(null, {qid: item.qid, title: item.title, number: item.number});
    }, function(err, results) {
        res.json(stripPrivateFields(results));
    });
});

app.get("/questions/:qiids/params", function(req, res) {
    if (!qiCollect) {
        return sendError(res, 500, "Do not have access to the qInstances database collection");
    }
    var qiidToQInstance = function(qiid, callback) {
        qiCollect.findOne({qiid: qiid}, function(err, obj) {
            if (err) {
                return sendError(res, 500, "Error accessing qInstances database for qiid " + req.params.qiid, err);
            }
            ensureObjAuth(req, res, obj, function(obj) {
                if (!obj) {
                    return sendError(res, 404, "No qInstance with qiid " + req.params.qiid);
                }
                callback(null, obj);
            });
        });
    };

    var dirToQuestion = function(dir, callback) {
        var infoFile = path.join(questionsDir, dir, "info.json");
        fs.readFile(infoFile, function(err, data) {
            if (err) {
                callback(null, {qid: dir, error: "Unable to read file: " + infoFile});
                return;
            }
            var info;
            try {
                info = JSON.parse(data);
            } catch (e) {
                var eText = "Error reading file: " + infoFile + ": " + e.name + ": " + e.message;
                callback(null, {qid: dir, error: eText, title: eText, number: 0});
                return;
            }
            if (info.disabled) {
                callback(null, null);
                return;
            }
            callback(null, {qid: dir, title: info.title, number: info.number});
        });
    };
    async.map(req.params.qiids, qiidToQInstance, function(err, qInstances) {
        if (err) {
            return sendError(res, 500, "Could not find qInstances for qiids", err);
        }
        fs.readdir('questions', function(err, files) {
            if (err) {
                return sendError(res, 500, "Unable to access questions directory", err);
            }
            qids = [];
            qInstances.each(function(qInstance) {
                qids.push(qInstance["qid"]);
            });
            async.map(qids, dirToQuestion, function(err, questionList) {
                if (err) {
                    return sendError(res, 500, "Error reading question data", err);
                }
                async.reject(questionList, function(x, cb) {cb(x === null);}, function(questionList) {
                    res.json(stripPrivateFields(questionList));
                });
            });
        });
    });
});

app.get("/questions/:qid", function(req, res) {
    var info = questionDB[req.params.qid];
    if (info === undefined)
        return sendError(res, 404, "No such question: " + req.params.qid);
    res.json(stripPrivateFields({qid: info.qid, title: info.title, number: info.number}));
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
    var fullFilePath = path.join(questionsDir, filePath);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            // couldn't find the file
            if (info.template !== undefined) {
                // have a template, try it
                return questionFilePath(info.template, filename, callback, nTemplates + 1);
            } else {
                // no template, give up
                return callback("file not found: " + fullFilePath);
            }
        } else {
            // found the file
            return callback(null, filePath);
        }
    });
};

var sendQuestionFile = function(req, res, filename) {
    questionFilePath(req.params.qid, filename, function(err, filePath) {
        if (err)
            return sendError(res, 404, "No such file '" + filename + "' for qid: " + req.params.qid, err);
        res.sendfile(filePath, {root: questionsDir});
    });
};

app.get("/questions/:qid/:vid/question.html", function(req, res) {
    sendQuestionFile(req, res, "question.html");
});

app.get("/questions/:qid/:vid/client.js", function(req, res) {
    sendQuestionFile(req, res, "client.js");
});

app.get("/questions/:qid/:vid/inc/:filename", function(req, res) {
    sendQuestionFile(req, res, path.join("inc", req.params.filename));
});

app.get("/questions/:qid/:vid/params", function(req, res) {
    var qid = req.params.qid;
    var vid = req.params.vid;
    var info = questionDB[qid];
    if (info === undefined) {
        return sendError(res, 404, "No such QID: " + qid);
    }
    questionFilePath(qid, "server.js", function(err, filePath) {
        if (err)
            return sendError(res, 404, "Unable to find 'server.js' for qid: " + qid, err);
        var serverFilePath = path.join(questionsDir, filePath);
        requirejs([serverFilePath], function(server) {
            if (server === undefined)
                return sendError("Unable to load 'server.js' for qid: " + qid);
            var params;
            try {
                params = server.getParams(vid, info);
            } catch (e) {
                return sendError(res, 500, "Error in " + serverFilePath + " getParams(): " + e.toString(), {stack: e.stack});
            }
            res.json(stripPrivateFields(params));
        });
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
                var perms = [];
                if (superusers[u.uid] === true)
                    perms.push("superuser");
                callback(null, {
                    name: u.name,
                    uid: u.uid,
                    perms: perms
                });
            }, function(err, objs) {
                if (err) {
                    return sendError(res, 500, "Error cleaning users", err);
                }
                filterObjsByAuth(req, objs, function(objs) {
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
        var perms = [];
        if (superusers[uObj.uid] === true)
            perms.push("superuser");
        var obj = {
            name: uObj.name,
            uid: uObj.uid,
            perms: perms
        };
        ensureObjAuth(req, res, obj, function(obj) {
            res.json(stripPrivateFields(obj));
        });
    });
});

app.get("/users/:uid/qScores", function(req, res) {
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
        var qScores = [], i;
        _.each(questionDB, function(info, qid) {
            if (uObj.qScores !== undefined && uObj.qScores[qid] !== undefined) {
                qScores.push(uObj.qScores[qid]);
            } else {
                qScores.push({
                    uid: req.params.uid,
                    qid: qid,
                    n: 0,
                    avgScore: 0,
                    maxScore: 0
                });
            }
        });
        for (i = 0; i < qScores.length; i++) {
            qScores[i].uid = req.params.uid;
        }
        filterObjsByAuth(req, qScores, function(qScores) {
            res.json(stripPrivateFields(qScores));
        });
    });
});

app.get("/users/:uid/qScores/:qid", function(req, res) {
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
        var qScore = {
            uid: req.params.uid,
            qid: req.params.qid,
            n: 0,
            avgScore: 0,
            maxScore: 0
        };
        if (uObj.qScores != null) {
            if (uObj.qScores[req.params.qid] != null) {
                qScore = uObj.qScores[req.params.qid];
            }
        }
        qScore.uid = req.params.uid;
        ensureObjAuth(req, res, qScore, function(qScore) {
            res.json(stripPrivateFields(qScore));
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
            filterObjsByAuth(req, objs, function(objs) {
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
        ensureObjAuth(req, res, obj, function(obj) {
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
    qInstance.date = new Date();
    var info = questionDB[qInstance.qid];
    if (info === undefined) {
        return sendError(res, 400, "Invalid QID: " + qInstance.qid);
    }
    if (qInstance.vid === undefined) {
        qInstance.vid = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
    }
    ensureObjAuth(req, res, qInstance, function(qInstance) {
        newIDNoError(req, res, "qiid", function(qiid) {
            qInstance.qiid = qiid;
            qiCollect.insert(qInstance, {w: 1}, function(err) {
                if (err) {
                    return sendError(res, 500, "Error writing qInstance to database", err);
                }
                return callback(qInstance);
            });
        });
    });
};

app.post("/qInstances", function(req, res) {
    var qInstance = {
        uid: req.body.uid,
        qid: req.body.qid,
        vid: req.body.vid,
        tiid: req.body.tiid,
        tid: req.body.tid,
    };
    makeQInstance(req, res, qInstance, function(qInstance) {
        res.json(stripPrivateFields(qInstance));
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
            filterObjsByAuth(req, objs, function(objs) {
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
        ensureObjAuth(req, res, obj, function(obj) {
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
    var serverFile = path.join(testsDir, tid, "server.js");
    requirejs([serverFile], function(server) {
        return callback(server);
    });
};

var writeTInstance = function(req, res, obj, callback) {
    if (obj.tiid === undefined)
        return sendError(res, 500, "No tiid for write to tInstance database", {tInstance: obj});
    if (obj._id !== undefined)
        delete obj._id;
    ensureObjAuth(req, res, obj, function(obj) {
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

var updateTest = function(req, res, submission, callback) {
    var tiid = submission.tiid;
    if (tiid === undefined)
        return callback(submission);
    readTInstance(res, tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, function(tInstance) {
            var tid = tInstance.tid;
            readTest(res, tid, function(test) {
                loadTestServer(tid, function(server) {
                    var uid = submission.uid;
                    if (!_(tInstance).has("submissionsByQid")) {
                        submission.oldTInstance = deepClone(tInstance);
                        submission.oldTest = deepClone(test);
                    }
                    try {
                        server.update(tInstance, test, submission);
                    } catch (e) {
                        return sendError(res, 500, "Error updating test: " + String(e), {err: e, stack: e.stack});
                    }
                    if (!_(tInstance).has("submissionsByQid")) {
                        submission.newTInstance = deepClone(tInstance);
                        submission.newTest = deepClone(test);
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
        tiid: req.body.tiid,
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
        if (!isSuperuser(req))
            return sendError(res, 403, "Superuser permissions required for override");
        submission.overrideScore = req.body.overrideScore;
    }
    if (req.body.practice !== undefined) {
        submission.practice = req.body.practice;
    }
    readQInstance(res, submission.qiid, function(qInstance) {
        submission.qid = qInstance.qid;
        submission.vid = qInstance.vid;
        var info = questionDB[submission.qid];
        if (info === undefined) {
            return sendError(res, 404, "No such QID: " + submission.qid);
        }
        questionFilePath(submission.qid, "server.js", function(err, filePath) {
            if (err)
                return sendError(res, 404, "Unable to find 'server.js' for qid: " + submission.qid, err);
            var serverFilePath = path.join(questionsDir, filePath);
            requirejs([serverFilePath], function(server) {
                if (server === undefined)
                    return sendError("Unable to load 'server.js' for qid: " + submission.qid);
                var params;
                try {
                    params = server.getParams(submission.vid, info);
                } catch (e) {
                    return sendError(res, 500, "Error in " + serverFilePath + " getParams(): " + e.toString(), {stack: e.stack});
                }
                if (submission.overrideScore !== undefined) {
                    submission.score = submission.overrideScore;
                } else {
                    var grading;
                    try {
                        grading = server.gradeAnswer(submission.submittedAnswer, params, submission.vid, info);
                    } catch (e) {
                        return sendError(res, 500, "Error in " + serverFilePath + " gradeAnswer(): " + e.toString(), {stack: e.stack});
                    }
                    submission.score = grading.score;
                    submission.trueAnswer = grading.trueAnswer;
                }
                ensureObjAuth(req, res, submission, function(submission) {
                    newIDNoError(req, res, "sid", function(sid) {
                        submission.sid = sid;
                        sCollect.insert(submission, {w: 1}, function(err) {
                            if (err) {
                                return sendError(res, 500, "Error writing submission to database", err);
                            }
                            updateTest(req, res, submission, function(submission) {
                                var projection = {};
                                projection["qScores." + submission.qid] = 1;
                                uCollect.findOne({uid: submission.uid}, projection, function(err, obj) {
                                    if (err) {
                                        return sendError(res, 500, "Error accessing users database for uid " + submission.uid, err);
                                    }
                                    if (!obj) {
                                        return sendError(res, 404, "No user with uid " + submission.uid);
                                    }
                                    var newQScore;
                                    if (obj.qScores != null) {
                                        if (obj.qScores[submission.qid] != null) {
                                            var oldQScore = obj.qScores[submission.qid];
                                            newQScore = {};
                                            newQScore.n = oldQScore.n + 1;
                                            newQScore.recentScores = oldQScore.recentScores || [];
                                            newQScore.recentScores.push(submission.score);
                                            if (newQScore.recentScores.length > 5) {
                                                newQScore.recentScores = newQScore.recentScores.slice(newQScore.recentScores.length - 5);
                                            }
                                            var totalScore = newQScore.recentScores.reduce(function(a, b) {return a + b;});
                                            newQScore.avgScore = totalScore / newQScore.recentScores.length;
                                            newQScore.maxScore = Math.max(oldQScore.maxScore, submission.score);
                                        }
                                    }
                                    if (newQScore == null) {
                                        newQScore = {};
                                        newQScore.n = 1;
                                        newQScore.recentScores = [submission.score];
                                        newQScore.avgScore = submission.score;
                                        newQScore.maxScore = submission.score;
                                    }
                                    var set = {};
                                    set["qScores." + submission.qid + ".n"] = newQScore.n;
                                    set["qScores." + submission.qid + ".qid"] = submission.qid;
                                    set["qScores." + submission.qid + ".recentScores"] = newQScore.recentScores;
                                    set["qScores." + submission.qid + ".avgScore"] = newQScore.avgScore;
                                    set["qScores." + submission.qid + ".maxScore"] = newQScore.maxScore;
                                    uCollect.update({_id: obj._id}, {$set: set}, {w: 1}, function(err) {
                                        if (err) {
                                            return sendError(res, 500, "Error writing qScore to database", err);
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
            res.json(stripPrivateFields(objs));
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
        res.json(stripPrivateFields(obj));
    });
});

app.get("/tests/:tid/client.js", function(req, res) {
    var filePath = path.join(req.params.tid, "client.js");
    res.sendfile(filePath, {root: testsDir});
});

app.get("/tests/:tid/common.js", function(req, res) {
    var filePath = path.join(req.params.tid, "common.js");
    res.sendfile(filePath, {root: testsDir});
});

app.get("/tests/:tid/test.html", function(req, res) {
    var filePath = path.join(req.params.tid, "test.html");
    res.sendfile(filePath, {root: testsDir});
});

app.get("/tests/:tid/testOverview.html", function(req, res) {
    var filePath = path.join(req.params.tid, "testOverview.html");
    res.sendfile(filePath, {root: testsDir});
});

app.get("/tests/:tid/testSidebar.html", function(req, res) {
    var filePath = path.join(req.params.tid, "testSidebar.html");
    res.sendfile(filePath, {root: testsDir});
});

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
        cursor.toArray(function(err, objs) {
            if (err) {
                return sendError(res, 500, "Error serializing tInstances", err);
            }
            var tiDB = _(objs).groupBy("tid");
            async.each(_(testDB).values(), function(item, callback) {
                if (item.autoCreate && tiDB[item.tid] === undefined && req.query.uid !== undefined) {
                    var serverFile = path.join(testsDir, item.tid, "server.js");
                    requirejs([serverFile], function(server) {
                        var tInstance = server.initUserData(req.query.uid);
                        _.extend(tInstance, {
                            tid: item.tid,
                            uid: req.query.uid,
                            date: new Date()
                        });
                        newIDNoError(req, res, "tiid", function(tiid) {
                            tInstance.tiid = tiid;
                            tiCollect.insert(tInstance, {w: 1}, function(err) {
                                if (err) {
                                    logger.error("Error writing tInstance to database", {tInstance: tInstance, err: err});
                                    return callback(err);
                                }
                                tiDB[tInstance.tid] = [tInstance];
                                callback(null);
                            });
                        });
                    });
                } else {
                    callback(null);
                }
            }, function(err) {
                if (err)
                    return sendError(res, 500, "Error autoCreating tInstances", err);
                var tiList = _.chain(tiDB).values().flatten(true).value();
                if ("type" in req.query)
                    tiList = _(tiList).filter(function(item) {return req.query.type === testDB[item.tid].type;});
                filterObjsByAuth(req, tiList, function(tiList) {
                    res.json(stripPrivateFields(tiList));
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
        ensureObjAuth(req, res, obj, function(obj) {
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
    if (testInfo.autoCreate) {
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

                var serverFile = path.join(testsDir, tid, "server.js");
                requirejs([serverFile], function(server) {
                    var tInstance = server.initUserData(uid);
                    _.extend(tInstance, {
                        tid: tid,
                        uid: uid,
                        number: number,
                        date: new Date(),
                    });
                    newIDNoError(req, res, "tiid", function(tiid) {
                        tInstance.tiid = tiid;
                        if (testInfo.autoCreateQuestions && tInstance.qids !== undefined) {
                            async.map(tInstance.qids, function(qid, callback) {
                                var qInstance = {
                                    qid: qid,
                                    uid: uid,
                                    tiid: tInstance.tiid,
                                    tid: tid
                                };
                                makeQInstance(req, res, qInstance, function(qInstance) {
                                    callback(null, [qid, qInstance.qiid]);
                                });
                            }, function(err, listOfQidPairQiid) {
                                if (err)
                                    return sendError(res, 400, "Error creating qInstances", {tiid: tInstance.tiid, err: err});
                                tInstance.qiidsByQid = _.object(listOfQidPairQiid);
                                writeTInstance(req, res, tInstance, function() {
                                    res.json(stripPrivateFields(tInstance));
                                });
                            })
                        } else {
                            writeTInstance(req, res, tInstance, function() {
                                res.json(stripPrivateFields(tInstance));
                            });
                        }
                    });
                });
            }
        });
    });
});

var finishTest = function(req, res, tiid, callback) {
    readTInstance(res, tiid, function(tInstance) {
        ensureObjAuth(req, res, tInstance, function(tInstance) {
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

app.patch("/tInstances/:tiid", function(req, res) {
    var tiid = req.params.tiid;
    if (tiid === undefined) {
        return sendError(res, 400, "No tiid provided");
    }
    if (req.body.open === undefined)
        return sendError(res, 400, "Patch can only be to 'open' member");
    if (req.body.open !== false)
        return sendError(res, 400, 'Patch can only be to set "open": false');

    finishTest(req, res, tiid, function(tInstance) {
        res.json(stripPrivateFields(tInstance));
    });
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
                if (!checkObjAuth(req, item))
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

app.get("/stats/usersPerStartHour/:examName", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "usersPerStartHour", examName: req.params.examName}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for usersPerStartHour/" + req.params.examName, err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for usersPerStartHour/" + req.params.examName);
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/stats/usersPerSubmissionCount", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "usersPerSubmissionCount"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for usersPerSubmissionCount", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for usersPerSubmissionCount");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/stats/averageQScores", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "averageQScores"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for averageQScores", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for averageQScores");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/stats/uScores", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "uScores"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for uScores", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for uScores");
        }
        res.json(stripPrivateFields(obj));
    });
});

app.get("/stats/trueAvgScores", function(req, res) {
    if (!statsCollect) {
        return sendError(res, 500, "Do not have access to the 'statistics' database collection");
    }
    statsCollect.findOne({name: "trueAvgScores"}, function(err, obj) {
        if (err) {
            return sendError(res, 500, "Error accessing 'statistics' collections for trueAvgScores", err);
        }
        if (!obj) {
            return sendError(res, 404, "No stats for trueAvgScores");
        }
        res.json(stripPrivateFields(obj));
    });
});

if (DEPLOY_MODE !== 'engr') {
    app.get("/", function(req, res) {
        res.sendfile("index.html", {root: frontendDir});
    });

    app.get("/index.html", function(req, res) {
        res.sendfile("index.html", {root: frontendDir});
    });

    app.get("/require/:filename", function(req, res) {
        res.sendfile(path.join("require", req.params.filename), {root: frontendDir});
    });

    app.get("/require/browser/:filename", function(req, res) {
        res.sendfile(path.join("require", "browser", req.params.filename), {root: frontendDir});
    });

    app.get("/css/:filename", function(req, res) {
        res.sendfile(path.join("css", req.params.filename), {root: frontendDir});
    });

    app.get("/text/:filename", function(req, res) {
        res.sendfile(path.join("text", req.params.filename), {root: frontendDir});
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
                if (skipUIDs[uid]) {
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
                if (skipUIDs[uid]) {
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

var usersPerStartHour = function(examName, earliestDate, examDate) {
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
        var firstDates = {}, firstDate;
        cursor.each(function(err, item) {
            if (err) {
                return;
            }
            var uid, date;
            if (item != null) {
                uid = item.uid;
                if (skipUIDs[uid]) {
                    return;
                }
                date = item.date;
                if (date.getTime() < earliestDate.getTime())
                    return;
                if (firstDates[uid] === undefined || date.getTime() < firstDates[uid].getTime())
                    firstDates[uid] = date;
                if (firstDate === undefined || date.getTime() < firstDate.getTime())
                    firstDate = date;
            } else {
                // end of collection
                var hours = [], users = [];
                if (firstDate !== undefined) {
                    var maxHours = Math.ceil((examDate.getTime() - firstDate.getTime()) / (60 * 60 * 1000));
                    var i;
                    for (i = 0; i <= maxHours; i++) {
                        hours[i] = i;
                        users[i] = 0;
                    }
                    var h;
                    for (uid in firstDates) {
                        h = Math.max(0, Math.ceil((examDate.getTime() - firstDates[uid]) / (60 * 60 * 1000)));
                        users[h]++;
                    }
                }
                var obj = {
                    date: new Date(),
                    hours: hours,
                    users: users,
                    examName: examName,
                    examDate: examDate
                };
                statsCollect.update({name: "usersPerStartHour", examName: examName}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'usersPerStartHour' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var usersPerSubmissionCount = function() {
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
        var counts = {};
        cursor.each(function(err, item) {
            if (err) {
                return;
            }
            var uid;
            if (item != null) {
                uid = item.uid;
                if (skipUIDs[uid]) {
                    return;
                }
                if (counts[uid] === undefined)
                    counts[uid] = 0;
                counts[uid]++;
            } else {
                // end of collection
                var maxCount = -1;
                for (uid in counts)
                    maxCount = Math.max(maxCount, counts[uid]);
                var submissions = [], users = [];
                var i;
                for (i = 0; i <= maxCount; i++) {
                    submissions[i] = i;
                    users[i] = 0;
                }
                for (uid in counts)
                    users[counts[uid]]++;
                var obj = {
                    date: new Date(),
                    submissions: submissions,
                    users: users
                };
                statsCollect.update({name: "usersPerSubmissionCount"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'usersPerSubmissionCount' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var averageQScores = function() {
    if (!uCollect) {
        logger.error("Do not have access to the 'users' database collection");
        return;
    }
    if (!statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    requirejs(['renderer'], function(renderer) {
        uCollect.find({}, {"uid": 1, "qScores": 1}, function(err, cursor) {
            if (err) {
                logger.error("unable to iterate over 'users' collection", err);
                return;
            }
            var nUsers = 0, nTotal = {}, nUsersNonZero = {}, avgScoreTotal = {};
            var nTypeCounts = {}, avgScoreTypeCounts = {};
            var predScoreTotal = {}, predScoreTypeCounts = {};
            var donePredScoreTotal = {}, donePredScoreTypeCounts = {};
            cursor.each(function(err, item) {
                if (err) {
                    logger.error("Error in users cursor");
                    return;
                }
                var uid;
                if (item != null) {
                    uid = item.uid;
                    if (skipUIDs[uid]) {
                        return;
                    }
                    nUsers++;
                    _.each(questionDB, function(info, qid) {
                        var n = 0, avgScore = 0;
                        if (item.qScores !== undefined && item.qScores[qid] !== undefined) {
                            n = item.qScores[qid].n;
                            avgScore = item.qScores[qid].avgScore;
                        }
                        if (nTotal[qid] === undefined)
                            nTotal[qid] = 0;
                        if (nUsersNonZero[qid] === undefined)
                            nUsersNonZero[qid] = 0;
                        if (avgScoreTotal[qid] === undefined)
                            avgScoreTotal[qid] = 0;
                        if (nTypeCounts[qid] === undefined)
                            nTypeCounts[qid] = renderer.zeroCounts();
                        if (avgScoreTypeCounts[qid] === undefined)
                            avgScoreTypeCounts[qid] = renderer.zeroCounts();
                        nTotal[qid] += n;
                        var nColorType = renderer.attemptsColorType(n);
                        nTypeCounts[qid][nColorType]++;
                        if (n > 0) { // only average over students with non-zero attempts
                            nUsersNonZero[qid] += 1;
                            avgScoreTotal[qid] += avgScore;
                            var avgScoreColorType = renderer.scoreColorType(avgScore);
                            avgScoreTypeCounts[qid][avgScoreColorType]++;
                        }

                        var user = userDB[uid];
                        var question = questionDB[qid];
                        if (user == null || question == null)
                            return;
                        var predScore = PrairieModel.userQuestionProb(user.dist, question.dist).p;

                        if (predScoreTotal[qid] === undefined)
                            predScoreTotal[qid] = 0;
                        if (predScoreTypeCounts[qid] === undefined)
                            predScoreTypeCounts[qid] = renderer.zeroCounts();
                        if (donePredScoreTotal[qid] === undefined)
                            donePredScoreTotal[qid] = 0;
                        if (donePredScoreTypeCounts[qid] === undefined)
                            donePredScoreTypeCounts[qid] = renderer.zeroCounts();
                        predScoreTotal[qid] += predScore;
                        var predScoreColorType = renderer.scoreColorType(predScore);
                        predScoreTypeCounts[qid][predScoreColorType]++;
                        if (n > 0) {
                            donePredScoreTotal[qid] += predScore;
                            donePredScoreTypeCounts[qid][predScoreColorType]++;
                        }
                    });
                } else {
                    // end of collection
                    var qScores = [];
                    if (nUsers > 0) {
                        _.each(questionDB, function(info, qid) {
                            qScores.push({
                                qid: qid,
                                n: nTotal[qid] / nUsers,
                                avgScore: avgScoreTotal[qid] / Math.max(1, nUsersNonZero[qid]),
                                nTypeCounts: nTypeCounts[qid],
                                avgScoreTypeCounts: avgScoreTypeCounts[qid],
                                predScore: predScoreTotal[qid] / nUsers,
                                predScoreTypeCounts: predScoreTypeCounts[qid],
                                donePredScore: donePredScoreTotal[qid] / Math.max(1, nUsersNonZero[qid]),
                                donePredScoreTypeCounts: donePredScoreTypeCounts[qid]
                            });
                        });
                    }
                    var obj = {
                        date: new Date(),
                        nUsers: nUsers,
                        qScores: qScores
                    };
                    statsCollect.update({name: "averageQScores"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                        if (err) {
                            logger.error("Error writing 'averageQScores' to database 'stats' collection", err);
                        }
                    });
                }
            });
        });
    });
};

var uScores = function() {
    if (!uCollect) {
        logger.error("Do not have access to the 'users' database collection");
        return;
    }
    if (!statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    uCollect.find({}, {}, function(err, cursor) {
        if (err) {
            logger.error("unable to iterate over 'users' collection", err);
            return;
        }
        var uScores = [];
        cursor.each(function(err, item) {
            if (err) {
                logger.error("Error in users cursor");
                return;
            }
            var uid;
            if (item != null) {
                uid = item.uid;
                if (skipUIDs[uid]) {
                    return;
                }
                var predScores = [], nSubmissions = 0, avgScoreTotal = 0, nQAnswered = 0, uDist;
                _.each(questionDB, function(info, qid) {
                    if (item.qScores !== undefined && item.qScores[qid] !== undefined) {
                        var n = item.qScores[qid].n;
                        nSubmissions += n;
                        var avgScore = item.qScores[qid].avgScore;
                        if (n > 0) {
                            nQAnswered++;
                            avgScoreTotal += avgScore;
                        }
                    }

                    var user = userDB[uid];
                    var question = questionDB[qid];
                    if (user == null || question == null)
                        return;
                    uDist = user.dist;
                    var predScore = PrairieModel.userQuestionProb(user.dist, question.dist).p;
                    predScores.push(predScore);
                });
                var uObj = {};
                uObj.avgPredScore = PrairieStats.mean(predScores);
                uObj.midterm1 = item.midterm1;
                uObj.midterm2 = item.midterm2;
                uObj.gpa = item.gpa;
                uObj.gpaUIUC = item.gpaUIUC;
                uObj.gpaSTEM = item.gpaSTEM;
                uObj.nSubmissions = nSubmissions;
                uObj.nQAnswered = nQAnswered;
                uObj.avgScore = avgScoreTotal / nQAnswered;
                uObj.dist = uDist;
                uScores.push(uObj);
            } else {
                // end of collection
                var obj = {
                    date: new Date(),
                    uScores: uScores
                };
                statsCollect.update({name: "uScores"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                    if (err) {
                        logger.error("Error writing 'uScores' to database 'stats' collection", err);
                    }
                });
            }
        });
    });
};

var trueAvgScores = function() {
    if (!uCollect) {
        logger.error("Do not have access to the 'users' database collection");
        return;
    }
    if (!sCollect) {
        logger.error("Do not have access to the 'submissions' database collection");
        return;
    }
    if (!statsCollect) {
        logger.error("Do not have access to the 'stats' database collection");
        return;
    }
    uCollect.find({}, {}, function(err, cursor) {
        if (err) {
            logger.error("unable to iterate over 'users' collection", err);
            return;
        }
        var uData = {};
        cursor.each(function(err, item) {
            if (err) {
                logger.error("Error in users cursor");
                return;
            }
            var uid;
            if (item != null) {
                uid = item.uid;
                if (skipUIDs[uid]) {
                    return;
                }
                uData[uid] = {};
                uData[uid].midterm1 = item.midterm1;
                uData[uid].midterm2 = item.midterm2;
                uData[uid].gpa = item.gpa;
                uData[uid].gpaUIUC = item.gpaUIUC;
                uData[uid].gpaSTEM = item.gpaSTEM;
            } else {
                // end of collection
                sCollect.find({}, {}, function(err, cursor) {
                    if (err) {
                        logger.error("unable to iterate over 'submissions' collection", err);
                        return;
                    }
                    var scores = {}, predScores = {}, scoresUID = {}, predScoresUID = {};
                    cursor.each(function(err, item) {
                        if (err) {
                            logger.error("Error in submissions cursor");
                            return;
                        }
                        if (item != null) {
                            var uid = item.uid;
                            var qid = item.qid;
                            if (skipUIDs[uid]) {
                                return;
                            }
                            var user = userDB[uid];
                            var question = questionDB[qid];
                            if (user == null || question == null)
                                return;

                            scores[qid] = scores[qid] || {};
                            scores[qid][uid] = scores[qid][uid] || [];
                            scores[qid][uid].push(item.score);
                            predScores[qid] = predScores[qid] || {};
                            if (predScores[qid][uid] === undefined)
                                predScores[qid][uid] = PrairieModel.userQuestionProb(user.dist, question.dist).p;
                            scoresUID[uid] = scoresUID[uid] || {};
                            scoresUID[uid][qid] = scoresUID[uid][qid] || [];
                            scoresUID[uid][qid].push(item.score);
                            predScoresUID[uid] = predScoresUID[uid] || {};
                            if (predScoresUID[uid][qid] === undefined)
                                predScoresUID[uid][qid] = predScores[qid][uid];
                        } else {
                            // end of collection
                            var thresholdScore = function(s) {if (s >= 0.5) return 1; else return 0;};
                            var qScores = _.map(questionDB, function(info, qid) {
                                var qScore = {
                                    qid: qid,
                                    avgCorrectBySubmission: 0,
                                    avgCorrectByUser: 0,
                                    predCorrectBySubmission: 0,
                                    predCorrectByUser: 0
                                };
                                if (scores[qid] !== undefined) {
                                    var thresholdScore = function(s) {if (s >= 0.5) return 1; else return 0;};
                                    qScore.avgCorrectBySubmission = PrairieStats.mean(_.chain(scores[qid]).values().flatten().map(thresholdScore).value());
                                    qScore.avgCorrectByUser = PrairieStats.mean(_(scores[qid]).map(function(userScores) {return PrairieStats.mean(_(userScores).map(thresholdScore));}));
                                    var weightedPredScores = _(predScores[qid]).map(function(score, uid) {return {score: score, weight: scores[qid][uid].length};});
                                    qScore.predCorrectBySubmission = PrairieStats.mean(_.pluck(weightedPredScores, 'score'), _.pluck(weightedPredScores, 'weight'));
                                    qScore.predCorrectByUser = PrairieStats.mean(_(predScores[qid]).values());
                                }
                                return qScore;
                            });
                            var uScores = _.map(userDB, function(info, uid) {
                                var uScore = {
                                    totalSubmissions: 0,
                                    totalQuestions: 0,
                                    avgCorrectBySubmission: 0,
                                    avgCorrectByQuestion: 0,
                                    predCorrectBySubmission: 0,
                                    predCorrectByQuestion: 0,
                                    midterm1: 0,
                                    midterm2: 0,
                                    gpa: 0,
                                    gpaUIUC: 0,
                                    gpaSTEM: 0
                                };
                                if (scoresUID[uid] !== undefined) {
                                    uScore.totalSubmissions = _.chain(scoresUID[uid]).map(function(values) {return values.length;}).reduce(function(a, b) {return a + b;}, 0).value();
                                    uScore.totalQuestions = _(scoresUID[uid]).values().length;
                                    uScore.avgCorrectBySubmission = PrairieStats.mean(_.chain(scoresUID[uid]).values().flatten().map(thresholdScore).value());
                                    uScore.avgCorrectByQuestion = PrairieStats.mean(_(scoresUID[uid]).map(function(questionScores) {return PrairieStats.mean(_(questionScores).map(thresholdScore));}));
                                    var weightedPredScoresUID = _(predScoresUID[uid]).map(function(score, qid) {return {score: score, weight: scoresUID[uid][qid].length};});
                                    uScore.predCorrectBySubmission = PrairieStats.mean(_.pluck(weightedPredScoresUID, 'score'), _.pluck(weightedPredScoresUID, 'weight'));
                                    uScore.predCorrectByQuestion = PrairieStats.mean(_(predScoresUID[uid]).values());
                                }
                                if (uData[uid] !== undefined) {
                                    uScore.midterm1 = uData[uid].midterm1;
                                    uScore.midterm2 = uData[uid].midterm2;
                                    uScore.gpa = uData[uid].gpa;
                                    uScore.gpaUIUC = uData[uid].gpaUIUC;
                                    uScore.gpaSTEM = uData[uid].gpaSTEM;
                                }
                                var user = userDB[uid];
                                if (user !== undefined) {
                                    uScore.dist = user.dist;
                                }
                                return uScore;
                            });
                            var uqScores = _.chain(scores).map(function(values, qid) {
                                return _(values).map(function(s, uid) {
                                    return {
                                        qid: qid,
                                        uid: uid,
                                        nAttempts: s.length,
                                        avgScore: _(s).map(thresholdScore).reduce(function(a, b) {return a + b;}, 0) / s.length,
                                        predScore: predScores[qid][uid]
                                    };
                                });
                            }).flatten().value();
                            var obj = {
                                date: new Date(),
                                qScores: qScores,
                                uScores: uScores,
                                uqScores: uqScores
                            };
                            statsCollect.update({name: "trueAvgScores"}, {$set: obj}, {upsert: true, w: 1}, function(err) {
                                if (err) {
                                    logger.error("Error writing 'trueAvgScores' to database 'stats' collection", err);
                                }
                            });
                        }
                    });
                });
            }
        });
    });
};

var computeStats = function() {
    submissionsPerHour();
    usersPerHour();
    //usersPerStartHour("Midterm1", new Date("2013-09-01T00:00-05:00"), new Date("2013-10-03T19:00-05:00"));
    //usersPerStartHour("Midterm2", new Date("2013-10-30T00:00-06:00"), new Date("2013-11-07T19:00-06:00"));
    //usersPerSubmissionCount();
    //averageQScores();
    //trueAvgScores();
    //uScores();
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
    if (DEPLOY_MODE === 'engr') {
        var options = {
            key: fs.readFileSync('/etc/pki/tls/private/localhost.key'),
            cert: fs.readFileSync('/etc/pki/tls/certs/localhost.crt'),
            ca: [fs.readFileSync('/etc/pki/tls/certs/server-chain.crt')]
        };
        https.createServer(options, app).listen(443);
        logger.info('server listening to HTTPS on port 443');
    } else if (DEPLOY_MODE === 'c9') {
        app.listen(process.env.PORT, process.env.IP);
        logger.info('server listening to HTTP');
    } else {
        app.listen(3000);
        logger.info('server listening to HTTP');
    }
    callback(null);
};

var startIntervalJobs = function(callback) {
    setInterval(monitor, SAMPLE_INTERVAL);
    setInterval(computeStats, STATS_INTERVAL);
    callback(null);
};

async.series([
    function(callback) {
        loadInfoDB(questionDB, "qid", questionsDir, callback);
    },
    function(callback) {
        loadInfoDB(testDB, "tid", testsDir, callback);
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
        logger.info("PrairieLearn server ready");
        console.log("PrairieLearn server ready");
    }
});
