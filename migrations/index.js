const ERR = require('async-stacktrace');
const fs = require('fs');
const path = require('path');
const async = require('async');
const _ = require('lodash');

const namedLocks = require('../lib/named-locks');
const error = require('@prairielearn/prairielib/error');
const logger = require('../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.init = function(callback) {
    const lockName = 'migrations';
    logger.verbose(`Waiting for lock ${lockName}`);
    namedLocks.waitLock(lockName, (err, lock) => {
        if (ERR(err, callback)) return;
        logger.verbose(`Acquired lock ${lockName}`);
        this._initWithLock((err) => {
            namedLocks.releaseLock(lock, (lockErr) => {
                if (ERR(lockErr, callback)) return;
                if (ERR(err, callback)) return;
                logger.verbose(`Released lock ${lockName}`);
                callback(null);
            });
        });
    });
};

module.exports._initWithLock = function(callback) {
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

                const regex = /^([0-9]+)_.+\.sql$/;
                files = files
                    .filter(file => regex.test(file))
                    .map(file => {
                        const index = Number.parseInt(regex.exec(file)[1]);
                        return {
                            index: index,
                            filename: file,
                        };
                    })
                    .sort((a, b) => {
                        return a.index - b.index;
                    });

                // check that we don't have repeated indexes
                const repeatedIndexes = _(files)
                    .groupBy(file => file.index)
                    .pickBy(fileList => (fileList.length > 1))
                    .map((fileList, index) => `Repeated index ${index}:\n` + _.map(fileList, 'filename').join('\n'))
                    .value();
                if (repeatedIndexes.length > 0) {
                    return callback(new Error(`Repeated migration indexes:\n${repeatedIndexes.join('\n')}`));
                }

                files = files.filter(file => file.index > last_migration);
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
