var ERR = require('async-stacktrace');
var async = require('async');
var path = require('path');

var config = require('../lib/config');
var load = require('../lib/load');
var cron = require('../cron');
var socketServer = require('../lib/socket-server');
var serverJobs = require('../lib/server-jobs');
var syncFromDisk = require('../sync/syncFromDisk');
var freeformServer = require('../question-servers/freeform');

config.startServer = false;
config.serverPort = 3007;
var server = require('../server');

var logger = require('./dummyLogger');
var helperDb = require('./helperDb');

var courseDir = path.join(__dirname, '..', 'exampleCourse');

module.exports = {
    before: function(callback) {
        var that = this;
        async.series([
            function(callback) {
                // pass "this" explicitly to enable this.timeout() calls
                helperDb.before.call(that, function(err) {
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
            function(callback) {
                server.insertDevUser(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                syncFromDisk.syncOrCreateDiskToSql(courseDir, logger, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                load.initEstimator('request', 1);
                load.initEstimator('authed_request', 1);
                load.initEstimator('python', 1);
                callback(null);
            },
            function(callback) {
                server.startServer(function(err) {
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
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    after: function(callback) {
        var that = this;
        // call close()/stop() functions in reverse order to the
        // start() functions above
        async.series([
            function(callback) {
                freeformServer.close(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                load.close();
                callback(null);
            },
            function(callback) {
                server.stopServer(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                cron.stop(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                helperDb.after.call(that, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
