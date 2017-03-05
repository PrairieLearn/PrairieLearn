var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var pg = require('pg');

var config = require('../lib/config');
var sqldb = require('../lib/sqldb');
var models = require('../models');
var sprocs = require('../sprocs');
var cron = require('../cron');
var courseDB = require('../lib/course-db');

var postgresqlUser = 'postgres';
var postgresqlDatabase = 'pltest';
var postgresqlHost = 'localhost';
var initConString = 'postgres://localhost/postgres';

module.exports = {
    before: function(callback) {
        // long timeout because DROP DATABASE might take a long time to error
        // if other processes have an open connection to that database
        this.timeout(10000);
        var client;
        async.series([
            function(callback) {
                client = new pg.Client(initConString);
                client.connect(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client.query('DROP DATABASE IF EXISTS ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client.query('CREATE DATABASE ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client.end();
                callback(null);
            },
            function(callback) {
                var pgConfig = {
                    user: postgresqlUser,
                    database: postgresqlDatabase,
                    host: postgresqlHost,
                    max: 10,
                    idleTimeoutMillis: 30000,
                };
                var idleErrorHandler = function(err) {
                    throw Error('idle client error', err);
                };
                sqldb.init(pgConfig, idleErrorHandler, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                models.init(function(err) {
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
                cron.init(function(err) {
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
        var client;
        async.series([
            function(callback) {
                sqldb.close(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client = new pg.Client(initConString);
                client.connect(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client.query('DROP DATABASE IF EXISTS ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                client.end();
                callback(null);
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
