// @ts-check
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

/**
 * Timestamp prefixes will be of the form `YYYYMMDDHHMMSS`, which will have 14 digits.
 * If this code is still around in the year 10000... good luck.
 */
const MIGRATION_FILENAME_REGEX = /^(?:([0-9]{14})_)?(?:([0-9]+)_)?.+\.sql$/;

/**
 * @typedef {Object} MigrationFile
 * @property {string} filename
 * @property {number | null} index
 * @property {string | null} timestamp
 */

/**
 *
 * @param {string} dir
 * @return {Promise<MigrationFile[]>}
 */
async function readAndValidateMigrationsFromDirectory(dir) {
  const migrationFiles = (await fs.readdir(dir)).filter((m) => m.endsWith('.sql'));

  const migrations = migrationFiles.map((mf) => {
    const match = mf.match(MIGRATION_FILENAME_REGEX);

    if (!match) {
      throw new Error(`Invalid migration filename: ${mf}`);
    }

    const timestamp = match[1] ?? null;
    const index = match[2] ?? null;

    if (timestamp === null && index === null) {
      throw new Error(`Migration ${mf} is missing a timestamp or index`);
    }

    return {
      filename: mf,
      index: index ? Number.parseInt(index, 10) : null,
      timestamp,
    };
  });

  // First pass: validate that all migrations have a unique timestamp prefix.
  // This will avoid data loss and conflicts in unexpected scenarios.
  let hasSeenIndex = false;
  let hasSeenTimestamp = false;
  let allMigrationsHaveIndex = true;
  let allMigrationsHaveTimestamp = true;
  let seenIndexes = new Set();
  let seenTimestamps = new Set();
  for (const migration of migrations) {
    const { filename, timestamp, index } = migration;

    if (timestamp !== null) {
      if (seenTimestamps.has(timestamp)) {
        throw new Error(`Duplicate migration timestamp: ${timestamp} (${filename})`);
      }
      seenTimestamps.add(timestamp);
      hasSeenTimestamp = true;
    } else {
      allMigrationsHaveTimestamp = false;
    }

    if (index !== null) {
      if (seenIndexes.has(index)) {
        throw new Error(`Duplicate migration index: ${index} (${filename})`);
      }
      seenIndexes.add(index);
      hasSeenIndex = true;
    } else {
      allMigrationsHaveIndex = false;
    }
  }

  // Validation: if one migration has a timestamp, *all* migrations must have a timestamp.
  if (hasSeenTimestamp && !allMigrationsHaveTimestamp) {
    const filesMissingTimestamp = migrations
      .filter((m) => m.timestamp === null)
      .map((m) => m.filename)
      .join(', ');
    throw new Error(
      `The following migration files are missing timestamps: ${filesMissingTimestamp}`
    );
  }

  // Validation: if one migration has an index, *all* migrations must have an index.
  if (hasSeenIndex && !allMigrationsHaveIndex) {
    const filesMissingIndex = migrations
      .filter((m) => m.index === null)
      .map((m) => m.filename)
      .join(', ');
    throw new Error(`The following migration files are missing indexes: ${filesMissingIndex}`);
  }

  return migrations;
}

/**
 * Determine the ordering of migrations. We will have already validates that either all migrations
 * have a timestamp or none of them do; ditto for indexes. So we can safely order on either
 * one or the other. Default to the timestamp if they're available, otherwise order on the index.

 * @param {MigrationFile[]} migrationFiles
 * @return {MigrationFile[]}
 */
function sortMigrationFiles(migrationFiles) {
  let allMigrationsHaveTimestamp = migrationFiles.every((m) => m.timestamp);
  return migrationFiles.sort((a, b) => {
    if (allMigrationsHaveTimestamp) {
      return a.timestamp.localeCompare(b.timestamp);
    } else {
      return a.index - b.index;
    }
  });
}

/**
 *
 * @param {MigrationFile[]} migrationFiles
 * @param {{ index: number | null, timestamp: string | null }[]} executedMigrations
 * @return {MigrationFile[]}
 */
function getMigrationsToExecute(migrationFiles, executedMigrations) {
  // If no migrations have ever been run, run them all.
  if (executedMigrations.length === 0) {
    return migrationFiles;
  }

  // If our migration files have timestamps, use them to determine which
  // have or have not executed. Otherwise, use the index.
  if (migrationFiles.every((m) => m.timestamp)) {
    return migrationFiles.filter(
      (m) => !executedMigrations.some((e) => e.timestamp === m.timestamp)
    );
  } else {
    return migrationFiles.filter((m) => !executedMigrations.some((e) => e.index === m.index));
  }
}

module.exports._initWithLock = function (callback) {
  logger.verbose('Starting DB schema migration');
  let noExistingMigrations = false;

  async.waterfall(
    [
      async () => {
        // Create the migrations table if needed
        await sqldb.queryAsync(sql.create_migrations_table, {});

        // Apply necessary changes to the migrations table as needed.
        try {
          await sqldb.queryAsync('SELECT project FROM migrations;', {});
        } catch (err) {
          if (err.routine === 'errorMissingColumn') {
            logger.info('Altering migrations table');
            await sqldb.queryAsync(sql.add_projects_column, {});
          } else {
            throw err;
          }
        }
        try {
          await sqldb.queryAsync('SELECT timestamp FROM migrations;', {});
        } catch (err) {
          if (err.routine === 'errorMissingColumn') {
            logger.info('Altering migrations table again');
            await sqldb.queryAsync(sql.add_timestamp_column, {});
          } else {
            throw err;
          }
        }

        // In the past, we uniquely identified and ordered migrations by an integer index.
        // However, this frequently causes conflicts between branches. To avoid this, we
        // switched to identifying migrations by a timestamp (e.g. `20220810085513`).
        //
        // However, we need to actually migrate from using an integer index to
        // using a timestamp. We'll achieve this using a multi-step deploy.
        //
        // First, we'll deploy a version of the code that still has the index embedded
        // in the filename. We'll use that to sync the new timestamps to the migrations
        // table.
        //
        // Only after that will we deploy a version that removes the index from the
        // migration filenames. As part of that, we'll add some safety checks that
        // will ensure that if we're deploying a migrations directory that doesn't
        // have *any* indexes in the filenames, we'll error out and prompt the user
        // to deploy an earlier version that still has timestamps.

        let allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });

        const migrationFiles = await readAndValidateMigrationsFromDirectory(migrationDir);

        // Validation: if we no longer have any indexes in the migration names,
        // ensure that the user has deployed an earlier version of the code that
        // already synced the indexes to the migrations table.
        if (!migrationFiles.some((m) => m.index !== null)) {
          const migrationsMissingTimestamps = allMigrations.filter((m) => !m.timestamp);
          if (migrationsMissingTimestamps.length > 0) {
            const missing = migrationsMissingTimestamps.map((m) => m.filename).join(', ');
            throw new Error(`The following migrations are missing timestamps: ${missing}`);
          }
        }

        // Second pass: reconcile the timestamps with the list of migrations in the database.
        // This should only matter a single time (the first time this code is deployed after
        // adding timestamps to all migrations).
        for (const { filename, timestamp, index } of migrationFiles) {
          if (!timestamp) {
            continue;
          }

          const migration = allMigrations.rows.find((m) => m.index === index);
          if (!migration || migration.timestamp) {
            // This migration hasn't been applied, or it's already been updated with a timestamp.
            continue;
          }

          logger.info(
            `Updating migration ${migration.index} with timestamp ${timestamp} and filename ${filename}`
          );
          await sqldb.queryAsync(sql.update_migration, {
            id: migration.id,
            timestamp,
            filename,
          });
        }

        // Refetch the list of migrations from the database.
        allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });

        // Sort the migration files into execution order.
        const sortedMigrationFiles = sortMigrationFiles(migrationFiles);

        // Figure out which migrations have to be applied.
        const migrationsToExecute = getMigrationsToExecute(
          sortedMigrationFiles,
          allMigrations.rows
        );

        for (const { filename, index, timestamp } of migrationsToExecute) {
          if (allMigrations.length === 0) {
            // if we are running all the migrations then log at a lower level
            logger.verbose(`Running migration ${filename}`);
          } else {
            logger.info(`Running migration ${filename}`);
          }

          // Read the migration.
          const migrationSql = await fs.readFile(path.join(migrationDir, filename), 'utf8');

          // Perform the migration.
          try {
            await sqldb.query(migrationSql, {});
          } catch (err) {
            error.addData(err, { sqlFile: filename });
            throw err;
          }

          // Record the migration.
          sqldb.query(sql.insert_migration, {
            filename: filename,
            index,
            timestamp,
            project,
          });
        }
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      logger.verbose('Successfully completed DB schema migration');
      callback(null);
    }
  );
};

// Exported for testing.
module.exports.readAndValidateMigrationsFromDirectory = readAndValidateMigrationsFromDirectory;
module.exports.sortMigrationFiles = sortMigrationFiles;
module.exports.getMigrationsToExecute = getMigrationsToExecute;
