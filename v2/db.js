var _ = require('lodash');
var async = require("async");

var config = require('./config');
var logger = require('./logger');

var MongoClient = require('mongodb').MongoClient;

var processCollection = function(name, err, collection, options, callback) {
    if (err) {
        logger.error("unable to fetch '" + name + "' collection", err);
        callback(true);
        return;
    }
    logger.info("successfully fetched '" + name + "' collection");
    var tasks = [];
    if (options.indexes) {
        _(options.indexes).forEach(function(index) {
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
            module.exports.countersCollect.update({_id: idName}, {$setOnInsert: {seq: 0}}, {w: 1, upsert: true}, function(err, result) {
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

var db; // module-level alias for module.exports.db

module.exports = {
    db: null,               // the database handle
    countersCollect: null,  // counters collection
    uCollect: null,         // users collection
    sCollect: null,         // submissions collection
    qiCollect: null,        // question instances collection
    statsCollect: null,     // statistics collection
    tCollect: null,         // tests collection
    tiCollect: null,        // test instances collection
    accessCollect: null,    // accesses collection
    pullCollect: null,      // pulls collection
    dCollect: null,         // deleted collection
    fCollect: null,         // finishes collection

    init: function(callback) {
        MongoClient.connect(config.dbAddress, function(err, locDb) {
            if (err) {
                callback("unable to connect to database at address " + config.dbAddress + ": " + err);
                return;
            }
            logger.info("successfully connected to database");
            module.exports.db = db = locDb;
            async.series([
                    function(cb) {
                        db.collection('counters', function(err, collection) {
                            module.exports.countersCollect = collection;
                            var options = {};
                            processCollection('counters', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('users', function(err, collection) {
                            module.exports.uCollect = collection;
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
                            module.exports.sCollect = collection;
                            var options = {
                                idPrefix: "s",
                                indexes: [
                                {keys: {sid: 1}, options: {unique: true}},
                                {keys: {uid: 1}, options: {}},
                                {keys: {qiid: 1}, options: {}},
                                ],
                            };
                            processCollection('submissions', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('qInstances', function(err, collection) {
                            module.exports.qiCollect = collection;
                            var options = {
                                idPrefix: "qi",
                                indexes: [
                                {keys: {qiid: 1}, options: {unique: true}},
                                {keys: {uid: 1}, options: {}},
                                {keys: {tiid: 1}, options: {}},
                                ],
                            };
                            processCollection('qInstances', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('statistics', function(err, collection) {
                            module.exports.statsCollect = collection;
                            var options = {};
                            processCollection('statistics', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('tests', function(err, collection) {
                            module.exports.tCollect = collection;
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
                            module.exports.tiCollect = collection;
                            var options = {
                                idPrefix: "ti",
                                indexes: [
                                {keys: {tiid: 1}, options: {unique: true}},
                                {keys: {uid: 1}, options: {}},
                                {keys: {tid: 1}, options: {}},
                                ],
                            };
                            processCollection('tInstances', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('accesses', function(err, collection) {
                            module.exports.accessCollect = collection;
                            var options = {};
                            processCollection('accesses', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('pulls', function(err, collection) {
                            module.exports.pullCollect = collection;
                            var options = {
                                idPrefix: "p",
                                indexes: [
                                {keys: {pid: 1}, options: {unique: true}},
                                {keys: {pullHash: 1}, options: {}},
                                ],
                            };
                            processCollection('pulls', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('deleted', function(err, collection) {
                            module.exports.dCollect = collection;
                            var options = {
                                idPrefix: "d",
                                indexes: [
                                {keys: {did: 1}, options: {unique: true}},
                                ],
                            };
                            processCollection('deleted', err, collection, options, cb);
                        });
                    },
                    function(cb) {
                        db.collection('finishes', function(err, collection) {
                            module.exports.fCollect = collection;
                            var options = {
                                idPrefix: "f",
                                indexes: [
                                {keys: {fid: 1}, options: {unique: true}},
                                ],
                            };
                            processCollection('finishes', err, collection, options, cb);
                        });
                    },
                ], function(err) {
                    if (err) {
                        callback("error loading DB collections");
                    } else {
                        logger.info("Successfully loaded all DB collections");
                        callback(null);
                    }
                });
        });
    },

    newID: function(type, callback) {
        var query = {_id: type};
        var sort = [['_id', 1]];
        var doc = {$inc: {seq: 1}};
        module.exports.countersCollect.findAndModify(query, sort, doc, {w: 1, new: true}, function(err, item) {
            if (err) return callback(err);
            var id = type.slice(0, type.length - 2) + item.value.seq;
            callback(null, id);
        });
    },
};
