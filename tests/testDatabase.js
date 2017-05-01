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
            if (ERR(err, done)) return;

            let missingFromModels = migrationsTables.filter(table => modelsTables.indexOf(table) < 0);
            let missingFromMigrations = modelsTables.filter(table => migrationsTables.indexOf(table) < 0);

            if (missingFromModels.length == 0 && missingFromMigrations.length == 0) {
                done(null);
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
                done(new DatabaseError(err));
            }
        });
    });

    it('should have the same columns when constructed from models or migrations', function(done) {
        this.timeout(30000);
        let modelsTables, migrationsTables;
        let modelsColumns = {}, migrationsColumns = {};

        // These are guaranteed to differ between the two databases, omit these
        // columns from the query resuls
        const columnsBlacklist = ['table_catalog', 'ordinal_position', 'udt_catalog', 'dtd_identifier'];

        async.waterfall([
            (callback) => setupNamedDatabaseWithInit('models_test', models, callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    modelsTables = result.rows.map(row => row.table_name)
                    callback(null);
                });
            },
            (callback) => {
                async.each(modelsTables, (table, callback) => {
                    const params = {
                        table_name: table
                    };
                    sqldb.query(sql.get_columns, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        modelsColumns[table] = _.map(result.rows, (column) => _.omit(column, columnsBlacklist));
                        callback(null);
                    })
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('models_test', callback),
            (callback) => setupNamedDatabaseWithInit('migrations_test', migrations, callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    migrationsTables = result.rows.map(row => row.table_name)
                    callback(null);
                });
            },
            (callback) => {
                async.each(migrationsTables, (table, callback) => {
                    const params = {
                        table_name: table
                    };
                    sqldb.query(sql.get_columns, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        migrationsColumns[table] = _.map(result.rows, (column) => _.omit(column, columnsBlacklist));
                        callback(null);
                    })
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('migrations_test', callback),
        ], (err) => {
            if (ERR(err, done)) return;

            // The diffing algorithm:
            //
            // First, take the intersection of the table names. We only want to
            // run column comparisons on tables that exist in both databases. If
            // a table does not exist in one, it will be caught by the previous
            // test.
            //
            // First, compute the difference of the column names; this should be
            // an empty set if the tables match. If this is not an empty set,
            // report this as a failure.
            //
            // Next, compute the intersection of the column names. For each object
            // in this set, compare the values of each property; they should match.
            // If they do not, report this as an error

            let tablesIntersection = _.intersection(modelsTables, migrationsTables);
            let errored = false;
            let errMsg = 'Error:\n';
            async.eachSeries(tablesIntersection, (table, callback) => {
                let modelsColumnNames = modelsColumns[table].map(column => column.column_name);
                let migrationsColumnNames = migrationsColumns[table].map(column => column.column_name);
                let missingFromModels = _.difference(migrationsColumnNames, modelsColumnNames);
                let missingFromMigrations = _.difference(modelsColumnNames, migrationsColumnNames);
                if (missingFromModels.length != 0) {
                    errored = true;
                    errMsg += `${table} [models]: missing column(s) ${missingFromModels.join(', ')}\n`;
                }
                if (missingFromMigrations.length != 0) {
                    errored = true;
                    errMsg += `${table} [migrations]: missing column(s) ${missingFromModels.join(', ')}\n`;
                }

                let columnsIntersection = _.intersection(modelsColumnNames, migrationsColumnNames);

                let modelsColumnMap = _.keyBy(modelsColumns[table], 'column_name');
                let migrationsColumnMap = _.keyBy(migrationsColumns[table], 'column_name');

                async.each(columnsIntersection, (column, callback) => {
                    let modelsColumn = modelsColumnMap[column];
                    let migrationsColumn = migrationsColumnMap[column];

                    // Assume that each has the exact same properties
                    _.each(_.keys(modelsColumn), (key) => {
                        let modelsValue = modelsColumn[key];
                        let migrationsValue = migrationsColumn[key];
                        if (modelsValue !== migrationsValue) {
                            errored = true;
                            errMsg += `${table}.${column}: attribute "${key}" missmatch. models: "${modelsValue}"; migrations: "${migrationsValue}"\n`;
                        }
                    });

                    callback(null);
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, done)) return;

                if (errored) {
                    done(new DatabaseError(errMsg));
                } else {
                    done(null);
                }
            });
        });
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
