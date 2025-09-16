import path from 'path';

import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import {
  type MigrationFile,
  parseAnnotations,
  readAndValidateMigrationsFromDirectories,
  sortMigrationFiles,
} from '../load-migrations.js';

const sql = sqldb.loadSqlEquiv(import.meta.filename);

interface InitOptions {
  directories: string[];
  project: string;
  migrationFilters?: {
    beforeTimestamp?: string | null;
    inclusiveBefore?: boolean;
  };
}

export async function init({ directories, project, migrationFilters = {} }: InitOptions) {
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
      await initWithLock({ directories: migrationDirectories, project, migrationFilters });
    },
  );
  logger.verbose(`Released lock ${lockName}`);
}

/**
 * Get the migrations to execute.
 *
 * @param migrationFiles The full list of migration files.
 * @param options The options for the migration execution.
 * @param options.excludeMigrations The list of migrations to exclude.
 * @param options.beforeTimestamp All migrations with timestamps before this timestamp will be excluded.
 * @param options.inclusiveBefore Whether to include the migration with the timestamp equal to the beforeTimestamp.
 */
export function getMigrationsToExecute(
  migrationFiles: MigrationFile[],
  {
    excludeMigrations = [],
    beforeTimestamp = null,
    inclusiveBefore = false,
  }: {
    excludeMigrations?: { timestamp: string | null }[];
    beforeTimestamp?: string | null;
    inclusiveBefore?: boolean;
  },
): MigrationFile[] {
  // If no migrations have ever been run, run them all.
  if (excludeMigrations.length === 0 && beforeTimestamp === null) {
    return migrationFiles;
  }

  const excludedMigrationTimestamps = new Set(excludeMigrations.map((m) => m.timestamp));
  const remainingMigrationFiles = migrationFiles.filter(
    (m) => !excludedMigrationTimestamps.has(m.timestamp),
  );
  if (beforeTimestamp === null) {
    return remainingMigrationFiles;
  }
  return remainingMigrationFiles.filter((m) =>
    inclusiveBefore ? m.timestamp <= beforeTimestamp : m.timestamp < beforeTimestamp,
  );
}

export async function initWithLock({ directories, project, migrationFilters = {} }: InitOptions) {
  const resolvedMigrationFilters = {
    beforeTimestamp: null,
    inclusiveBefore: false,
    ...migrationFilters,
  };

  logger.verbose('Starting DB schema migration');

  const oldSchema = sqldb.defaultPool.getSearchSchema();
  // Each postgres pool uses a unique schema every time the server starts up.
  // After that code runs, the default schema is set to that schema instead of public, which
  // causes the 'create_migrations_table' query to fail.
  //
  // We'll set the default schema to public before running the migrations, and then restore it
  // after the migrations are run.
  await sqldb.defaultPool.setSearchSchema('public');
  try {
    // Create the migrations table if needed
    await sqldb.execute(sql.create_migrations_table);

    // Apply necessary changes to the migrations table as needed.
    try {
      await sqldb.execute('SELECT project FROM migrations;');
    } catch (err: any) {
      if (err.routine === 'errorMissingColumn') {
        logger.info('Altering migrations table');
        await sqldb.execute(sql.add_projects_column);
      } else {
        throw err;
      }
    }
    try {
      await sqldb.execute('SELECT timestamp FROM migrations;');
    } catch (err: any) {
      if (err.routine === 'errorMissingColumn') {
        logger.info('Altering migrations table again');
        await sqldb.execute(sql.add_timestamp_column);
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
    const migrationsToExecute = getMigrationsToExecute(sortedMigrationFiles, {
      excludeMigrations: allMigrations.rows,
      ...resolvedMigrationFilters,
    });
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
            await sqldb.execute(migrationSql);
          } else {
            await sqldb.runInTransactionAsync(async () => {
              await sqldb.execute(migrationSql);
            });
          }
        } catch (err) {
          error.addData(err, { sqlFile: filename });
          throw err;
        }
      } else {
        const migrationModule = await import(/* @vite-ignore */ migrationPath);
        const implementation = migrationModule.default;
        if (typeof implementation !== 'function') {
          throw new Error(`Migration ${filename} does not export a default function`);
        }
        await implementation();
      }

      // Record the migration.
      await sqldb.execute(sql.insert_migration, {
        filename,
        timestamp,
        project,
      });
    }
  } finally {
    // Restore the search schema
    await sqldb.defaultPool.setSearchSchema(oldSchema);
  }
}
