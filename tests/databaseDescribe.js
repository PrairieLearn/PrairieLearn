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

module.exports = {};

/**
 * will produce a description of a given database's schema. This will include
 * information about tables, enums, contraints, indices, etc.
 *
 * This functions accepts an 'options' object with various options that determine
 * how the function will run. The following properties are available on the
 * 'options' object:
 *
 * databaseName [REQUIRED]: the name of the database to describe
 * outputFormat [default: 'string']: determines how the description is formatted.s
 *
 * @param  {Object}   options  Options for this function
 * @param  {Function} callback Will receive results of an error when complete
 */
module.exports.describe = function(options, callback) {
    if (!options) return callback(new Error('options must not be null'));
    if (!options.databaseName) return callback(new Error('you must specify a database name with dbName'));

    var tableNames;
    var tables;

    var columns = {};

    var output = {
        tables: {},
    };

    async.series([
        (callback) => {
            // Connect to the database
            var pgConfig = {
                user: options.postgresqlUser || 'postgres',
                database: options.databaseName,
                host: options.postgresqlHost || 'localhost',
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
        (callback) => {
            // Get the names of the tables
            sqldb.query(sql.get_tables, [], (err, results) => {
                if (ERR(err, callback)) return;
                tables = results.rows;
                tableNames = results.rows.map(row => row.name);
                callback(null);
            });
        },
        (callback) => {
            // Get column info for each table
            async.each(tables, (table, callback) => {
                const params = {
                    oid: table.oid
                };
                sqldb.query(sql.get_columns_for_table, params, (err, results) => {
                    if (ERR(err, callback)) return;

                    // Transform table info into a string, if needed
                    if (options.outputFormat === 'string') {
                        output.tables[table.name] = results.rows.map((row) => {
                            var rowText = `${row.name}: ${row.type}`;
                            if (row.notnull) {
                                rowText += ' not null';
                            }
                            if (row.default) {
                                rowText += ` default ${row.default}`;
                            }
                            return rowText;
                        }).join('\n');
                    } else {
                        output.tables[table.name] = results.rows;
                    }
                    callback(null);
                })
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            })
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, output);
    });
};
