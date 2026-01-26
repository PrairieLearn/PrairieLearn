import * as path from 'node:path';

import { partition } from 'es-toolkit';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { describeDatabase, diffDirectoryAndDatabase } from '@prairielearn/postgres-tools';

import { REPOSITORY_ROOT_PATH } from '../lib/paths.js';

import * as helperDb from './helperDb.js';

// Custom error type so we can display our own message and omit a stacktrace
class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

const SOFT_DELETE_CASCADE_EXCEPTIONS: Record<string, string[]> = {
  // We want grading jobs to be soft deleted, primarily to support deleting AI
  // grading jobs while still retaining the jobs and their associated `ai_grading_jobs`
  // row for logging and auditing purposes, as well as usage tracking.
  //
  // While it's ultimately sub-optimal to lose the grading jobs if/when an assessment
  // instance is deleted, it's not a data integrity issue; we'll just lose some visibility
  // into what happened on the assessment instance. In the future, assessment instances
  // may be soft-deleted, which would allow us to retain the grading jobs.
  grading_jobs: ['submission_id'],
};

describe('database', { timeout: 20_000 }, function () {
  beforeAll(helperDb.beforeOnlyCreate);

  afterAll(helperDb.after);

  it('should match the database described in /database', { timeout: 20_000 }, async function () {
    const options = {
      outputFormat: 'string',
      coloredOutput: process.stdout.isTTY,
    };
    const dbDirectory = path.resolve(REPOSITORY_ROOT_PATH, 'database');
    const dbName = helperDb.getDatabaseNameForCurrentWorker();
    const diff = await diffDirectoryAndDatabase(dbDirectory, dbName, options);
    if (diff) {
      throw new DatabaseError(diff);
    }
  });

  it('should not contain "ON DELETE CASCADE" foreign keys from soft-delete to hard-delete tables', async function () {
    /*
     * The bad case is:
     * - Table A should only be soft-deleted (that is, it has a `deleted_at` column)
     * - Table B will be hard-deleted (does not have a `deleted_at` column)
     * - Foreign key from A to B, with ON DELETE CASCADE
     *
     * The problem occurs when we delete a row in table B. This
     * then automatically deletes the row in A, even though we
     * wanted to have the row in A be soft-deleted.
     *
     * See https://github.com/PrairieLearn/PrairieLearn/issues/2256 for a bug caused by this problem.
     */
    const dbName = helperDb.getDatabaseNameForCurrentWorker();
    const data = await describeDatabase(dbName);

    const [softDeleteTables, hardDeleteTables] = partition(Object.keys(data.tables), (table) =>
      data.tables[table].columns.some((column) => column.name === 'deleted_at'),
    );

    for (const table of softDeleteTables) {
      for (const constraint of data.tables[table].foreignKeyConstraints) {
        const match = constraint.def.match(
          /^FOREIGN KEY \((.*)\) REFERENCES (.*)\(.*\) ON UPDATE .* ON DELETE (.*)$/,
        );
        if (!match) {
          throw new Error(`Failed to match foreign key for ${table}: ${constraint.def}`);
        }
        const [, keyName, otherTable, deleteAction] = match;

        // Skip table/column pairs that are exceptions to the rule.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (SOFT_DELETE_CASCADE_EXCEPTIONS[table]?.includes(keyName)) continue;

        if (deleteAction === 'CASCADE' && hardDeleteTables.includes(otherTable)) {
          throw new Error(
            `Soft-delete table "${table}" has ON DELETE CASCADE foreign key "${keyName}" to hard-delete table "${otherTable}"`,
          );
        }
      }
    }
  });
});
