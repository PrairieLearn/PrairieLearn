import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type Course } from '../../lib/db-types.js';
import { type ServerJobLogger } from '../../lib/server-jobs.js';
import { syncDiskToSql } from '../../sync/syncFromDisk.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SyncProblemSchema = z.object({
  entity: z.string(),
  identifier: z.string().nullable(),
  errors: z.string().nullable(),
  warnings: z.string().nullable(),
});

export interface SyncCourseResult {
  status: 'complete' | 'sharing_error';
  hadJsonErrors: boolean;
  hadJsonErrorsOrWarnings: boolean;
  /** Per-entity sync errors and warnings, read back after the sync. */
  problems: {
    entity: string;
    identifier: string | null;
    errors: string | null;
    warnings: string | null;
  }[];
  log: string[];
}

/**
 * Syncs the course from disk into the database and returns any errors.
 *
 * This is the agent's commit point: it edits files with its own filesystem
 * tools, then calls this to validate and apply them. Sync errors are the
 * feedback signal for JSON schema violations, dangling QID references,
 * duplicate UUIDs, and undeclared topics or tags.
 */
export async function syncCourse(course: Course): Promise<SyncCourseResult> {
  const log: string[] = [];
  const logger: ServerJobLogger = {
    error: (msg) => log.push(msg),
    warn: (msg) => log.push(msg),
    info: (msg) => log.push(msg),
    // `verbose` output is per-entity timing noise; it isn't useful to the agent.
    verbose: () => {},
  };

  const result = await syncDiskToSql(course, logger);

  // `syncDiskToSql` reports only whether errors occurred. The messages
  // themselves are written to `sync_errors`/`sync_warnings` columns on each
  // entity, so we read them back to tell the agent what to fix.
  const problems = await sqldb.queryRows(
    sql.select_sync_problems,
    { course_id: course.id },
    SyncProblemSchema,
  );

  return {
    status: result.status,
    hadJsonErrors: result.status === 'complete' ? result.hadJsonErrors : true,
    hadJsonErrorsOrWarnings: result.status === 'complete' ? result.hadJsonErrorsOrWarnings : true,
    problems,
    log,
  };
}
