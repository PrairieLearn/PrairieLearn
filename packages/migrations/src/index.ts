import fs from 'fs-extra';
import path from 'path';

import * as namedLocks from '@prairielearn/named-locks';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

const sql = sqldb.loadSqlEquiv(__filename);

export async function init(migrationDir: string, project: string) {
  const lockName = 'migrations';
  logger.verbose(`Waiting for lock ${lockName}`);
  await namedLocks.doWithLock(
    lockName,
    {
      // Migrations *might* take a long time to run, so we'll enable automatic
      // lock renewal so that our lock doesn't get killed by the Postgres
      // idle session timeout.
      //
      // That said, we should generally try to keep migrations executing as
      // quickly as possible. A long-running migration likely means that
      // Postgres is locking a whole table, which is unacceptable in production.
      autoRenew: true,
    },
    async () => {
      logger.verbose(`Acquired lock ${lockName}`);
      await initWithLock(migrationDir, project);
    }
  );
  logger.verbose(`Released lock ${lockName}`);
}

/**
 * Timestamp prefixes will be of the form `YYYYMMDDHHMMSS`, which will have 14 digits.
 * If this code is still around in the year 10000... good luck.
 */
const MIGRATION_FILENAME_REGEX = /^([0-9]{14})_.+\.[a-z]+$/;

interface MigrationFile {
  filename: string;
  timestamp: string;
}

export async function readAndValidateMigrationsFromDirectory(
  dir: string,
  extensions: string[]
): Promise<MigrationFile[]> {
  const migrationFiles = (await fs.readdir(dir)).filter((m) =>
    extensions.some((e) => m.endsWith(e))
  );

  const migrations = migrationFiles.map((mf) => {
    const match = mf.match(MIGRATION_FILENAME_REGEX);

    if (!match) {
      throw new Error(`Invalid migration filename: ${mf}`);
    }

    const timestamp = match[1] ?? null;

    if (timestamp === null) {
      throw new Error(`Migration ${mf} does not have a timestamp`);
    }

    return {
      filename: mf,
      timestamp,
    };
  });

  // First pass: validate that all migrations have a unique timestamp prefix.
  // This will avoid data loss and conflicts in unexpected scenarios.
  const seenTimestamps = new Set();
  for (const migration of migrations) {
    const { filename, timestamp } = migration;

    if (timestamp !== null) {
      if (seenTimestamps.has(timestamp)) {
        throw new Error(`Duplicate migration timestamp: ${timestamp} (${filename})`);
      }
      seenTimestamps.add(timestamp);
    }
  }

  return migrations;
}

export function sortMigrationFiles(migrationFiles: MigrationFile[]): MigrationFile[] {
  return migrationFiles.sort((a, b) => {
    return a.timestamp.localeCompare(b.timestamp);
  });
}

export function getMigrationsToExecute(
  migrationFiles: MigrationFile[],
  executedMigrations: { timestamp: string | null }[]
): MigrationFile[] {
  // If no migrations have ever been run, run them all.
  if (executedMigrations.length === 0) {
    return migrationFiles;
  }

  const executedMigrationTimestamps = new Set(executedMigrations.map((m) => m.timestamp));
  return migrationFiles.filter((m) => !executedMigrationTimestamps.has(m.timestamp));
}

export async function initWithLock(migrationDir: string, project: string) {
  logger.verbose('Starting DB schema migration');

  // Create the migrations table if needed
  await sqldb.queryAsync(sql.create_migrations_table, {});

  // Apply necessary changes to the migrations table as needed.
  try {
    await sqldb.queryAsync('SELECT project FROM migrations;', {});
  } catch (err: any) {
    if (err.routine === 'errorMissingColumn') {
      logger.info('Altering migrations table');
      await sqldb.queryAsync(sql.add_projects_column, {});
    } else {
      throw err;
    }
  }
  try {
    await sqldb.queryAsync('SELECT timestamp FROM migrations;', {});
  } catch (err: any) {
    if (err.routine === 'errorMissingColumn') {
      logger.info('Altering migrations table again');
      await sqldb.queryAsync(sql.add_timestamp_column, {});
    } else {
      throw err;
    }
  }

  let allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });

  const migrationFiles = await readAndValidateMigrationsFromDirectory(migrationDir, [
    '.sql',
    '.js',
    '.ts',
    '.mjs',
  ]);

  // Validation: if we not all previously-executed migrations have timestamps,
  // prompt the user to deploy an earlier version that includes both indexes
  // and timestamps.
  const migrationsMissingTimestamps = allMigrations.rows.filter((m) => !m.timestamp);
  if (migrationsMissingTimestamps.length > 0) {
    throw new Error(
      [
        'The following migrations are missing timestamps:',
        migrationsMissingTimestamps.map((m) => `  ${m.filename}`),
        // This revision was the most recent commit to `master` before the
        // code handling indexes was removed.
        'You must deploy revision 1aa43c7348fa24cf636413d720d06a2fa9e38ef2 first.',
      ].join('\n')
    );
  }

  // Refetch the list of migrations from the database.
  allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });

  // Sort the migration files into execution order.
  const sortedMigrationFiles = sortMigrationFiles(migrationFiles);

  // Figure out which migrations have to be applied.
  const migrationsToExecute = getMigrationsToExecute(sortedMigrationFiles, allMigrations.rows);

  for (const { filename, timestamp } of migrationsToExecute) {
    if (allMigrations.rows.length === 0) {
      // if we are running all the migrations then log at a lower level
      logger.verbose(`Running migration ${filename}`);
    } else {
      logger.info(`Running migration ${filename}`);
    }

    const migrationPath = path.join(migrationDir, filename);
    if (filename.endsWith('.sql')) {
      const migrationSql = await fs.readFile(migrationPath, 'utf8');
      try {
        await sqldb.queryAsync(migrationSql, {});
      } catch (err) {
        error.addData(err, { sqlFile: filename });
        throw err;
      }
    } else {
      const migrationModule = await import(migrationPath);
      const implementation = migrationModule.default;
      if (typeof implementation !== 'function') {
        throw new Error(`Migration ${filename} does not export a default function`);
      }
      await implementation();
    }

    // Record the migration.
    await sqldb.queryAsync(sql.insert_migration, {
      filename: filename,
      timestamp,
      project,
    });
  }
}
