const ERR = require('async-stacktrace');
const async = require('async');
const pgArray = require('pg').types.arrayParser;
const colors = require('colors');
const _ = require('lodash');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

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
 * outputFormat [default: 'string']: determines how the description is formatted
 * coloredOutput [default: false]: if the output should be colored for better readability
 *
 * @param  {Object}   options  Options for this function
 * @param  {Function} callback Will receive results of an error when complete
 */
module.exports.describe = function(options, callback) {
    if (!options) return callback(new Error('options must not be null'));
    if (!options.databaseName) return callback(new Error('you must specify a database name with databaseName'));
    if (options.outputFormat && !(options.outputFormat == 'string' || options.outputFormat == 'object')) {
        return callback(new Error(`'${options.outputFormat}' is not a valid output format`));
    }

    var tables;
    var ignoreColumns = {};

    var output = {
        tables: {},
        enums: {},
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

                // Filter out ignored tables
                if (options.ignoreTables && _.isArray(options.ignoreTables)) {
                    tables = _.filter(tables, table => options.ignoreTables.indexOf(table.name) == -1);
                }

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
            // Transform ignored columns into a map from table names to arrays
            // of column names
            if (options.ignoreColumns && _.isArray(options.ignoreColumns)) {
                ignoreColumns = _.filter(options.ignoreColumns, ignore => {
                    return /^[^\s.]*\.[^\s.]*$/.test(ignore);
                });
                ignoreColumns = _.reduce(ignoreColumns, (result, value) => {
                    var res = /^(([^\s.]*)\.([^\s.]*))$/.exec(value);
                    var table = res[2];
                    var column = res[3];
                    (result[table] || (result[table] = [])).push(column);
                    return result;
                }, {});
            }
            callback(null);
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

                            const rows = _.filter(results.rows, row => {
                                return (ignoreColumns[table.name] || []).indexOf(row.name) == -1;
                            });

                            if (rows.length == 0) {
                                return callback(null);
                            }

                            // Transform table info into a string, if needed
                            if (options.outputFormat === 'string') {
                                output.tables[table.name] += formatText('columns\n', colors.underline);
                                output.tables[table.name] += rows.map((row) => {
                                    var rowText = formatText(`    ${row.name}`, colors.bold);
                                    rowText += ':' + formatText(` ${row.type}`, colors.green);
                                    if (row.notnull) {
                                        rowText += formatText(' not null', colors.gray);
                                    }
                                    if (row.default) {
                                        rowText += formatText(` default ${row.default}`, colors.gray);
                                    }
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].columns = rows;
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

                            if (results.rows.length == 0) {
                                return callback(null);
                            }

                            if (options.outputFormat === 'string') {
                                if (output.tables[table.name].length != 0) {
                                    output.tables[table.name] += '\n\n';
                                }
                                output.tables[table.name] += formatText('indexes\n', colors.underline);
                                output.tables[table.name] += results.rows.map((row) => {
                                    const using = row.indexdef.substring(row.indexdef.indexOf('USING '));
                                    var rowText = formatText(`    ${row.name}`, colors.bold) + ':';
                                    rowText += row.constraintdef ? formatText(` ${row.constraintdef}`, colors.green) : '';
                                    rowText += using ? formatText(` ${using}`, colors.green) : '';
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
                        sqldb.query(sql.get_foreign_key_constraints_for_table, params, (err, results) => {
                            if (ERR(err, callback)) return;

                            if (results.rows.length == 0) {
                                return callback(null);
                            }

                            if (options.outputFormat === 'string') {
                                if (output.tables[table.name].length != 0) {
                                    output.tables[table.name] += '\n\n';
                                }
                                output.tables[table.name] += formatText('foreign-key constraints\n', colors.underline);
                                output.tables[table.name] += results.rows.map((row) => {
                                    var rowText = formatText(`    ${row.name}:`, colors.bold);
                                    rowText += formatText(` ${row.def}`, colors.green);
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].foreignKeyConstraings = results.rows;
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

                            // Filter out references from ignored tables
                            let rows = results.rows;
                            if (options.ignoreTables && _.isArray(options.ignoreTables)) {
                                rows = _.filter(results.rows, row => {
                                    return options.ignoreTables.indexOf(row.table) == -1;
                                });
                            }

                            if (rows.length == 0) {
                                return callback(null);
                            }

                            if (options.outputFormat === 'string') {
                                if (output.tables[table.name].length != 0) {
                                    output.tables[table.name] += '\n\n';
                                }
                                output.tables[table.name] += formatText('referenced by\n', colors.underline);
                                output.tables[table.name] += rows.map((row) => {
                                    var rowText = formatText(`    ${row.table}:`, colors.bold);
                                    rowText += formatText(` ${row.condef}`, colors.green);
                                    return rowText;
                                }).join('\n');
                            } else {
                                output.tables[table.name].references = rows;
                            }
                            callback(null);
                        });
                    },
                ], (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // Get all enums
            sqldb.query(sql.get_enums, [], (err, results) => {
                if (ERR(err, callback)) return;

                // Filter ignored enums
                let rows = results.rows;
                if (options.ignoreEnums && _.isArray(options.ignoreEnums)) {
                    rows = _.filter(results.rows, row => {
                        return options.ignoreEnums.indexOf(row.name) == -1;
                    });
                }

                if (rows.length == 0) {
                    return callback(null);
                }

                rows.forEach((row) => {
                    if (options.outputFormat == 'string') {
                        const values = pgArray.create(row.values, String).parse();
                        output.enums[row.name] = formatText(values.join(', '), colors.gray);
                    } else {
                        output.enums[row.name] = pgArray.create(row.values, String).parse();
                    }
                });

                callback(null);
            });
        },
        (callback) => {
            // We need to tack on a newline to everything if we're in string mode
            if (options.outputFormat == 'string') {
                output.tables = _.mapValues(output.tables, item => item + '\n');
                output.enums = _.mapValues(output.enums, item => item + '\n');
            }
            callback(null);
        },
        (callback) => {
            sqldb.close((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, output);
    });
};
