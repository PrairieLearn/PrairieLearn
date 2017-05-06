var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var assert = require('chai').assert;
var colors = require('colors');

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
    if (options.outputFormat && !(options.outputFormat !== 'string' || options.outputFormat !== 'object')) {
        return callback(new Error(`'${options.outputFormat}' is not a valid output format`));
    }

    var tables;

    var output = {
        tables: {},
    };

    var formatText = function(text, formatter) {
        if (options.coloredOutput) {
            return formatter(text);
        }
        return text;
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

                // Initialize output with names of tables
                if (options.outputFormat === 'string') {
                    tables.forEach((table) => output.tables[table.name] = '');
                } else {
                    tables.forEach((table) => output.tables[table.name] = {});
                }

                callback(null);
            });
        },
        (callback) => {
            // Get column info for each table
            async.each(tables, (table, callback) => {
                async.series([
                    (callback) => {
                        const params = {
                            oid: table.oid,
                        };
                        sqldb.query(sql.get_columns_for_table, params, (err, results) => {
                            if (ERR(err, callback)) return;

                            // Transform table info into a string, if needed
                            if (options.outputFormat === 'string') {
                                output.tables[table.name] += formatText('columns\n', colors.underline);
                                output.tables[table.name] += results.rows.map((row) => {
                                    var rowText = formatText(`    ${row.name}`, colors.bold);
                                    rowText += ': ' + formatText(`${row.type}`, colors.green);
                                    if (row.notnull) {
                                        rowText += formatText(' not null', colors.gray);
                                    }
                                    if (row.default) {
                                        rowText += formatText(` default ${row.default}`, colors.gray);
                                    }
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].columns = results.rows;
                            }
                            callback(null);
                        });
                    },
                    (callback) => {
                        const params = {
                            oid: table.oid,
                        };
                        sqldb.query(sql.get_indexes_for_table, params, (err, results) => {
                            if (ERR(err, callback)) return;

                            if (options.outputFormat === 'string') {
                                if (output.tables[table.name].length != 0) {
                                    output.tables[table.name] += '\n\n';
                                }
                                output.tables[table.name] += formatText('indexes\n', colors.underline);
                                output.tables[table.name] += results.rows.map((row) => {
                                    var rowText = formatText(`    ${row.name}`, colors.bold);
                                    rowText += formatText(`: ${row.constraintdef}`, colors.green);
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].indexes = results.rows;
                            }
                            callback(null);
                        });
                    },
                    (callback) => {
                        const params = {
                            oid: table.oid,
                        };
                        sqldb.query(sql.get_references_for_table, params, (err, results) => {
                            if (ERR(err, callback)) return;

                            if (options.outputFormat === 'string') {
                                if (output.tables[table.name].length != 0) {
                                    output.tables[table.name] += '\n\n';
                                }
                                output.tables[table.name] += formatText('referenced by\n', colors.underline);
                                output.tables[table.name] += results.rows.map((row) => {
                                    var rowText = formatText(`    ${row.table}:`, colors.bold);
                                    rowText += formatText(` ${row.condef}`, colors.green);
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].references = results.rows;
                            }
                            callback(null);
                        });
                    }
                ], (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                })
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            })
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, output);
    });
};
