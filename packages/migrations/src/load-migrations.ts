import fs from 'fs-extra';

/**
 * Timestamp prefixes will be of the form `YYYYMMDDHHMMSS`, which will have 14 digits.
 * If this code is still around in the year 10000... good luck.
 */
const MIGRATION_FILENAME_REGEX = /^([0-9]{14})_.+\.[a-z]+/;

/**
 * Annotations are expressed via the following:
 *
 * -- prairielearn:migrations NO TRANSACTION
 *
 * Currently, `NO TRANSACTION` is the only supported annotation. This will run
 * the migration without a transaction. This is useful for migrations that use
 * features that can't be run in transactions, such as `CREATE INDEX CONCURRENTLY`.
 */
const ANNOTATION_PREFIX = '-- prairielearn:migrations';
const ALLOWED_ANNOTATIONS = new Set(['NO TRANSACTION']);

export interface MigrationFile {
  directory: string;
  filename: string;
  timestamp: string;
}

export async function readAndValidateMigrationsFromDirectory(
  dir: string,
  extensions: string[],
): Promise<MigrationFile[]> {
  const migrationFiles = (await fs.readdir(dir)).filter((m) =>
    extensions.some((e) => m.endsWith(e)),
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
      directory: dir,
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

export async function readAndValidateMigrationsFromDirectories(
  directories: string[],
  extensions: string[],
): Promise<MigrationFile[]> {
  const allMigrations: MigrationFile[] = [];
  for (const directory of directories) {
    const migrations = await readAndValidateMigrationsFromDirectory(directory, extensions);
    allMigrations.push(...migrations);
  }
  return allMigrations;
}

export function sortMigrationFiles(migrationFiles: MigrationFile[]): MigrationFile[] {
  return migrationFiles.sort((a, b) => {
    return a.timestamp.localeCompare(b.timestamp);
  });
}

export function parseAnnotations(contents: string): Set<string> {
  const lines = contents.split('\n');
  const annotations = new Set<string>();

  lines.forEach((line) => {
    if (line.startsWith(ANNOTATION_PREFIX)) {
      const annotation = line.slice(ANNOTATION_PREFIX.length).trim();
      if (!ALLOWED_ANNOTATIONS.has(annotation)) {
        throw new Error(`Invalid annotation: ${annotation}`);
      }
      annotations.add(annotation);
    }
  });

  return annotations;
}
