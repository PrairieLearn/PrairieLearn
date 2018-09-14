var ERR = require('async-stacktrace');
var async = require('async');
var path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var config = require('../lib/config');
var load = require('../lib/load');
var cron = require('../cron');
var socketServer = require('../lib/socket-server');
var serverJobs = require('../lib/server-jobs');
var syncFromDisk = require('../sync/syncFromDisk');
var freeformServer = require('../question-servers/freeform');
var cache = require('../lib/cache');
const workers = require('../lib/workers');

config.startServer = false;
config.serverPort = 3007;
var server = require('../server');

var logger = require('./dummyLogger');
var helperDb = require('./helperDb');

var courseDir = path.join(__dirname, '..', 'exampleCourse');

module.exports = {
    before: function(callback) {
        debug('before()');
        var that = this;
        async.series([
            function(callback) {
                debug('before(): initializing DB');
                // pass "this" explicitly to enable this.timeout() calls
                helperDb.before.call(that, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initializing cron');
                cron.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): inserting dev user');
                server.insertDevUser(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): sync from disk');
                syncFromDisk.syncOrCreateDiskToSql(courseDir, logger, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): set up load estimators');
                load.initEstimator('request', 1);
                load.initEstimator('authed_request', 1);
                load.initEstimator('python', 1);
                callback(null);
            },
            function(callback) {
                debug('before(): initialize workers');
                workers.init();
                callback(null);
            },
            function(callback) {
                debug('before(): start server');
                server.startServer(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initialize socket server');
                socketServer.init(server, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initialize cache');
                cache.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initialize server jobs');
                serverJobs.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initialize freeform server');
                freeformServer.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            debug('before(): completed');
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    after: function(callback) {
        debug('after()');
        var that = this;
        // call close()/stop() functions in reverse order to the
        // start() functions above
        async.series([
            function(callback) {
            debug('after(): finish workers');
                workers.finish(err => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): close freeform server');
                freeformServer.close(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): close load estimators');
                load.close();
                callback(null);
            },
            function(callback) {
                debug('after(): stop server');
                server.stopServer(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): stop cron');
                cron.stop(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): reset cache');
                cache.reset(function(err) {
                  if (ERR(err, callback)) return;
                  callback(null);
                });
            },
            function(callback) {
                debug('after(): finish DB');
                helperDb.after.call(that, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            debug('after(): complete');
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
