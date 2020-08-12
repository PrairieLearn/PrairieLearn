const util = require('util');
const ERR = require('async-stacktrace');
const async = require('async');
const tmp = require('tmp-promise');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../lib/config');
const load = require('../lib/load');
const cron = require('../cron');
const socketServer = require('../lib/socket-server');
const serverJobs = require('../lib/server-jobs');
const syncFromDisk = require('../sync/syncFromDisk');
const freeformServer = require('../question-servers/freeform');
const cache = require('../lib/cache');
const workers = require('../lib/workers');

config.startServer = false;
config.serverPort = 3007;
const server = require('../server');

const logger = require('./dummyLogger');
const helperDb = require('./helperDb');

const courseDirDefault = path.join(__dirname, '..', 'testCourse');

module.exports = {
    before: (courseDir) => {
        if (typeof courseDir == 'undefined') {
            courseDir = courseDirDefault;
        }
        return function(callback) {
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
                util.callbackify(async () => {
                    debug('before(): create tmp dir for config.filesRoot');
                    const tmpDir = await tmp.dir({ unsafeCleanup: true });
                    config.filesRoot = tmpDir.path;
                }),
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
        };
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
                debug('after(): close socket server');
                socketServer.close(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): close cache');
                cache.close(function(err) {
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
