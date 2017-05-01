var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var assert = require('chai').assert;

var models = require('../models');
var migrations = require('../migrations');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var postgresqlUser = 'postgres';

var postgresqlHost = 'localhost';
var initConString = 'postgres://localhost/postgres';

describe('database schemas', function() {
    it('tables should be the same when constructed from models or migrations', function(callback) {
        this.timeout(10000);
        let modelsTables, migrationsTables, modelsSchemas, migrationsSchemas;
        async.series([
            (callback) => setupNamedDatabaseWithInit('models_test', models, callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    modelsTables = result.rows.map(row => row.table_name);
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('models_test', callback),
            (callback) => setupNamedDatabaseWithInit('migrations_test', migrations, callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    migrationsTables = result.rows.map(row => row.table_name);
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('migrations_test', callback),
        ], (err) => {
            if (ERR(err, callback)) return;

            let missingFromModels = migrationsTables.filter(table => modelsTables.indexOf(table) < 0);
            let missingFromMigrations = modelsTables.filter(table => migrationsTables.indexOf(table) < 0);

            if (missingFromModels.length == 0 && missingFromMigrations.length == 0) {
                callback(null);
            } else {
                let err = 'Error:\n';
                if (missingFromModels.length > 0) {
                    err += 'The following tables are missing from the database constructed with models:\n';
                    missingFromModels.forEach(table => err += `${table}\n`)
                }
                if (missingFromMigrations.length > 0) {
                    err += 'The following tables are missing from the database constructed with migrations:\n';
                    missingFromMigrations.forEach(table => err += `${table}\n`)
                }
                callback(err);
            }
        })
    });
});

function setupNamedDatabaseWithInit(databaseName, init, callback) {
    if (!init || !init.init || typeof init.init !== 'function') callback(new Error('invalid init object!'));

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
            init.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
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
