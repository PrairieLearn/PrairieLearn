var ERR = require('async-stacktrace');
var fs = require('fs');
var path = require('path');
var async = require('async');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.init = function(callback) {
    logger.verbose('Starting DB schema migration');
    let noExistingMigrations = false;

    async.waterfall([
        (callback) => {
            // Create the migrations table if needed
            sqldb.query(sql.create_migrations_table, [], (err, _result) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // First, fetch the index of the last applied migration
            sqldb.queryOneRow(sql.get_last_migration, [], (err, results) => {
                if (ERR(err, callback)) return;
                let last_migration = results.rows[0].last_migration;
                if (last_migration == null) {
                    last_migration = -1;
                    noExistingMigrations = true;
                }
                callback(null, last_migration);
            });
        },
        (last_migration, callback) => {
            fs.readdir(__dirname, (err, files) => {
                if (ERR(err, callback)) return;

                const regex = /^([0-9]+).+\.sql$/;
                files = files
                    .filter(file => regex.test(file))
                    .map(file => {
                        const index = Number.parseInt(regex.exec(file)[1]);
                        return {
                            index: index,
                            filename: file,
                        };
                    })
                    .filter(file => file.index > last_migration)
                    .sort((a, b) => {
                        return a.index - b.index;
                    });
                callback(null, files);
            });
        },
        (files, callback) => {
            async.eachSeries(
                files,
                (file, callback) => {
                    if (noExistingMigrations) {
                        // if we are running all the migrations then log at a lower level
                        logger.verbose('Running migration ' + file.filename);
                    } else {
                        logger.info('Running migration ' + file.filename);
                    }
                    async.waterfall([
                        (callback) => {
                            fs.readFile(path.join(__dirname, file.filename), 'utf8', (err, sql) => {
                                if (ERR(err, callback)) return;
                                callback(null, sql);
                            });
                        },
                        (sql, callback) => {
                            // Perform the migration
                            sqldb.query(sql, [], (err, _result) => {
                                if (err) error.addData(err, {sqlFile: file.filename});
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                        (callback) => {
                            // Record the migration
                            const params = {
                                filename: file.filename,
                                index: file.index,
                            };
                            sqldb.query(sql.insert_migration, params, (err, _result) => {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                    ], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                }
            );
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        logger.verbose('Successfully completed DB schema migration');
        callback(null);
    });
};
