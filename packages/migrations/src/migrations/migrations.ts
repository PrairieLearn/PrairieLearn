import fs from 'fs-extra';
import path from 'path';

import * as namedLocks from '@prairielearn/named-locks';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import {
  MigrationFile,
  parseAnnotations,
  readAndValidateMigrationsFromDirectories,
  sortMigrationFiles,
} from '../load-migrations';

const sql = sqldb.loadSqlEquiv(__filename);

export async function init(directories: string | string[], project: string) {
  const migrationDirectories = Array.isArray(directories) ? directories : [directories];
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
      await initWithLock(migrationDirectories, project);
    },
  );
  logger.verbose(`Released lock ${lockName}`);
}

export function getMigrationsToExecute(
  migrationFiles: MigrationFile[],
  executedMigrations: { timestamp: string | null }[],
): MigrationFile[] {
  // If no migrations have ever been run, run them all.
  if (executedMigrations.length === 0) {
    return migrationFiles;
  }

  const executedMigrationTimestamps = new Set(executedMigrations.map((m) => m.timestamp));
  return migrationFiles.filter((m) => !executedMigrationTimestamps.has(m.timestamp));
}

export async function initWithLock(directories: string[], project: string) {
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

  const migrationFiles = await readAndValidateMigrationsFromDirectories(directories, [
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
      ].join('\n'),
    );
  }

  // Refetch the list of migrations from the database.
  allMigrations = await sqldb.queryAsync(sql.get_migrations, { project });

  // Sort the migration files into execution order.
  const sortedMigrationFiles = sortMigrationFiles(migrationFiles);

  // Figure out which migrations have to be applied.
  const migrationsToExecute = getMigrationsToExecute(sortedMigrationFiles, allMigrations.rows);

  for (const { directory, filename, timestamp } of migrationsToExecute) {
    if (allMigrations.rows.length === 0) {
      // if we are running all the migrations then log at a lower level
      logger.verbose(`Running migration ${filename}`);
    } else {
      logger.info(`Running migration ${filename}`);
    }

    const migrationPath = path.join(directory, filename);
    if (filename.endsWith('.sql')) {
      const migrationSql = await fs.readFile(migrationPath, 'utf8');
      const annotations = parseAnnotations(migrationSql);
      try {
        if (annotations.has('NO TRANSACTION')) {
          await sqldb.queryAsync(migrationSql, {});
        } else {
          await sqldb.runInTransactionAsync(async () => {
            await sqldb.queryAsync(migrationSql, {});
          });
        }
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
      filename,
      timestamp,
      project,
    });
  }
}
