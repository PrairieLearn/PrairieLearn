import { z } from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import { loadSqlEquiv, queryRows, queryScalar } from '@prairielearn/postgres';

import { type Course, CourseSchema } from '../../lib/db-types.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { getLockNameForCoursePath } from '../../models/course.js';
import { syncDiskToSqlWithLock } from '../../sync/syncFromDisk.js';

const sql = loadSqlEquiv(import.meta.url);

const COURSE_SYNC_BACKFILL_BATCH_SIZE = 10;

export function makeCourseSyncBackfillMigration() {
  return makeBatchedMigration({
    async getParameters() {
      const max = await queryScalar(
        sql.select_max_course_id,
        z.bigint({ coerce: true }).nullable(),
      );
      return {
        min: 1n,
        max,
        batchSize: COURSE_SYNC_BACKFILL_BATCH_SIZE,
      };
    },

    async execute(min: bigint, max: bigint): Promise<void> {
      const courses = await queryRows(sql.select_courses_for_sync, { min, max }, CourseSchema);

      const errors: Error[] = [];
      for (const course of courses) {
        try {
          await syncCourse(course);
        } catch (err) {
          errors.push(
            new Error(`Failed to sync course ${course.id} (${course.short_name})`, {
              cause: err,
            }),
          );
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors, `Failed to sync ${errors.length} course(s)`);
      }
    },
  });
}

/**
 * Re-syncs an existing course. Does NOT pull new changes from the remote repository.
 */
export async function syncCourse(course: Course) {
  const serverJob = await createServerJob({
    type: 'sync',
    description: 'Sync from disk',
    // Since this is a sync performed by the system, don't associate any user
    // with it.
    userId: null,
    authnUserId: null,
    courseId: course.id,
  });

  // We use `executeUnsafe` to ensure that any errors bubble up and mark the
  // batched migration job as failed.
  await serverJob.executeUnsafe(async (job) => {
    const lockName = getLockNameForCoursePath(course.path);
    await namedLocks.doWithLock(
      lockName,
      {
        // Set a long timeout to try to ensure that the lock is acquired.
        timeout: 60_000,
        onNotAcquired: () => job.fail('Another user is already syncing or modifying this course.'),
      },
      async () => {
        job.info('Sync git repository to database');
        await syncDiskToSqlWithLock(course, job);
      },
    );
  });
}
