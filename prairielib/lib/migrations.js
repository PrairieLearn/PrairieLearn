const ERR = require('async-stacktrace');
const fs = require('fs-extra');
const path = require('path');
const async = require('async');
const _ = require('lodash');

const namedLocks = require('../../lib/named-locks');
const logger = require('../../lib/logger');
const sqldb = require('../lib/sql-db');
const sqlLoader = require('../lib/sql-loader');
const error = require('../lib/error');

const sql = sqlLoader.loadSqlEquiv(__filename);

var migrationDir;
var project;

module.exports.init = function (dir, proj, callback) {
  const lockName = 'migrations';
  logger.verbose(`Waiting for lock ${lockName}`);
  namedLocks.waitLock(lockName, {}, (err, lock) => {
    if (ERR(err, callback)) return;
    logger.verbose(`Acquired lock ${lockName}`);
    migrationDir = dir;
    project = proj;
    module.exports._initWithLock((err) => {
      namedLocks.releaseLock(lock, (lockErr) => {
        if (ERR(lockErr, callback)) return;
        if (ERR(err, callback)) return;
        logger.verbose(`Released lock ${lockName}`);
        callback(null);
      });
    });
  });
};

module.exports._initWithLock = function (callback) {
  logger.verbose('Starting DB schema migration');
  let noExistingMigrations = false;

  async.waterfall(
    [
      async () => {
        // Create the migrations table if needed
        await sqldb.queryAsync(sql.create_migrations_table, {});

        // Alter the migrations table if needed
        try {
          await sqldb.queryAsync('SELECT project FROM migrations;', {});
        } catch (err) {
          if (err.routine === 'errorMissingColumn') {
            logger.info('Altering migrations table');
            await sqldb.queryAsync(sql.alter_migrations_table, {});
          }
        }

        try {
          await sqldb.queryAsync('SELECT timestamp_id FROM migrations;', {});
        } catch (err) {
          if (err.routine === 'errorMissingColumn') {
            logger.info('Altering migrations table again');
            await sqldb.queryAsync(sql.alter_migrations_table_2, {});
          }
        }

        // In the past, we uniquely identified and ordered migrations by an integer index.
        // However, this frequently causes conflicts between branches. To avoid this, we
        // switched to identifying migrations by a timestamp (e.g. `20220810085513`).
        // However, we left the index intact so that we could match up old migrations.
        // This next bit of code fills in the `timestamp_id` column with the value, if it
        // exists.
        const allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });
        console.log(allMigrations.rows);

        const migrationFiles = (await fs.readdir(migrationDir)).filter((m) => m.endsWith('.sql'));

        // Timestamp prefixes will be of the form `YYYYMMDDHHMMSS`, which will have 14 digits.
        // If this code is still around in the year 10000... good luck.
        const regex = /^(?:([0-9]{14})_)?([0-9]+)_.+\.sql$/;

        // First pass: validate that all migrations have a unique timestamp prefix.
        // This will avoid data loss and conflicts in unexpected scenarios.
        let seenTimestamps = new Set();
        for (const migrationFile of migrationFiles) {
          const match = migrationFile.match(regex);
          if (!match) {
            throw new Error(`Unexpected migration filename: ${migrationFile}`);
          }
          const timestamp = match[1];
          if (seenTimestamps.has(timestamp)) {
            throw new Error(`Duplicate migration timestamp: ${timestamp}`);
          }
        }

        // Second pass: reconcile the timestamps with the list of migrations in the database.
        // This should only matter a single time (the first time this code is deployed after
        // adding timestamps to all migrations).
        for (const migrationFile of migrationFiles) {
          const match = migrationFile.match(regex);

          const timestamp = match[1];
          const index = match[2];

          if (!timestamp) {
            continue;
          }

          const migration = allMigrations.rows.find((m) => m.index === index);
          if (!migration || migration.timestamp) {
            // This migration hasn't been applied, or it's already been updated with a timestamp.
            continue;
          }

          logger.info(
            `Updating migration ${migration.index} with timestamp ${timestamp} and filename ${migrationFile}`
          );
          await sqldb.queryAsync(sql.update_migration, {
            id: migration.id,
            timestamp,
            filename: migrationFile,
          });
        }

        // TODO: remove this.
        throw new Error('abort early');
      },
      async () => {
        // First, fetch the index of the last applied migration
        const results = await sqldb.queryOneRowAsync(sql.get_last_migration, { project });
        let last_migration = results.rows[0].last_migration;
        if (last_migration == null) {
          last_migration = -1;
          noExistingMigrations = true;
        }
        return last_migration;
      },
      (last_migration, callback) => {
        fs.readdir(migrationDir, (err, files) => {
          if (ERR(err, callback)) return;

          const regex = /^([0-9]+)_.+\.sql$/;
          files = files
            .filter((file) => regex.test(file))
            .map((file) => {
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
            .groupBy((file) => file.index)
            .pickBy((fileList) => fileList.length > 1)
            .map(
              (fileList, index) =>
                `Repeated index ${index}:\n` + _.map(fileList, 'filename').join('\n')
            )
            .value();
          if (repeatedIndexes.length > 0) {
            return callback(
              new Error(`Repeated migration indexes:\n${repeatedIndexes.join('\n')}`)
            );
          }

          files = files.filter((file) => file.index > last_migration);
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
            async.waterfall(
              [
                (callback) => {
                  fs.readFile(path.join(migrationDir, file.filename), 'utf8', (err, sql) => {
                    if (ERR(err, callback)) return;
                    callback(null, sql);
                  });
                },
                (sql, callback) => {
                  // Perform the migration
                  sqldb.query(sql, [], (err, _result) => {
                    if (err) error.addData(err, { sqlFile: file.filename });
                    if (ERR(err, callback)) return;
                    callback(null);
                  });
                },
                (callback) => {
                  // Record the migration
                  const params = {
                    filename: file.filename,
                    index: file.index,
                    project,
                  };
                  sqldb.query(sql.insert_migration, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                  });
                },
              ],
              (err) => {
                if (ERR(err, callback)) return;
                callback(null);
              }
            );
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      logger.verbose('Successfully completed DB schema migration');
      callback(null);
    }
  );
};
