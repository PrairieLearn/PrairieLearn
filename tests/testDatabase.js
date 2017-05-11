var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var assert = require('chai').assert;
var colors = require('colors');

var databaseDiff = require('./databaseDiff');
var migrations = require('../migrations');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var postgresqlUser = 'postgres';
var postgresqlHost = 'localhost';
var initConString = 'postgres://localhost/postgres';


// Custom error type so we can handle this specially
function DatabaseError(message) {
  this.name = 'DatabaseError';
  this.message = message;
}
DatabaseError.prototype = Object.create(Error.prototype);
DatabaseError.prototype.constructor = DatabaseError;

describe('databases', function() {

    it('should have the same tables when constructed from models or migrations', function(done) {
        this.timeout(10000);
        let results = '';
        let errMsg = '';
        async.series([
            (callback) => setupNamedDatabase('migrations_test', callback),
            (callback) => {
                const options = {
                    outputFormat: 'string',
                    coloredOutput: process.stdout.isTTY,
                };
                databaseDiff.diffDirectoryAndDatabase('database', 'migrations_test', options, (err, data) => {
                    if (ERR(err, callback)) return;
                    errMsg = data;
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('migrations_test', callback),
        ], (err) => {
            if (ERR(err, done)) return;
            if (errMsg) {
                // We add a newline with red ANSI codes so that mocha's default
                // red coloring doesn't mess up our diff rendering
                done(new DatabaseError('\n'.red + errMsg));
            } else {
                done(null);
            }
        });
    });
});

function setupNamedDatabase(databaseName, callback) {
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
            client.query('DROP DATABASE IF EXISTS ' + databaseName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.query('CREATE DATABASE ' + databaseName + ';', function(err) {
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
                database: databaseName,
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
        }
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function tearDownNamedDatabase(databaseName, callback) {
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
            client.query('DROP DATABASE IF EXISTS ' + databaseName + ';', function(err) {
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
}
