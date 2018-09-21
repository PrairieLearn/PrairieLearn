var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var sqldb = require('@prairielearn/prairielib/sql-db');
var migrations = require('../migrations');
var sprocs = require('../sprocs');

var postgresqlUser = 'postgres';
var postgresqlDatabase = 'pltest';
var postgresqlHost = 'localhost';
var initConString = 'postgres://postgres@localhost/postgres';

module.exports = {
    before: function(callback) {
        debug('before()');
        // long timeout because DROP DATABASE might take a long time to error
        // if other processes have an open connection to that database
        this.timeout(20000);
        var client;
        async.series([
            function(callback) {
                debug('before(): connecting client');
                client = new pg.Client(initConString);
                client.connect(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): dropping database');
                client.query('DROP DATABASE IF EXISTS ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): creating database');
                client.query('CREATE DATABASE ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): ending client');
                client.end();
                callback(null);
            },
            function(callback) {
                debug('before(): initializing sqldb');
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
                debug('before(): running migrations');
                migrations.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('before(): initializing sprocs');
                sprocs.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            debug('before(): complete');
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    after: function(callback) {
        debug('after()');
        this.timeout(20000);
        var client;
        async.series([
            function(callback) {
                debug('after(): closing sqldb');
                sqldb.close(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                debug('after(): connecting client');
                client = new pg.Client(initConString);
                client.connect(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
/*
            function(callback) {
                debug('after(): dropping database');
                client.query('DROP DATABASE IF EXISTS ' + postgresqlDatabase + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
*/
            function(callback) {
                debug('after(): ending client');
                client.end();
                callback(null);
            },
        ], function(err) {
            debug('after(): complete');
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    // This version will only (re)create the database with migrations; it will
    // then close the connection in sqldb. This is necessary for database
    // schema verification, where databaseDiff will set up a connection to the
    // desired database.
    beforeOnlyCreate: function(callback) {
        // long timeout because DROP DATABASE might take a long time to error
        // if other processes have an open connection to that database
        this.timeout(20000);
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
                migrations.init(function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                sqldb.close(function(err) {
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
