import { makeBatchedMigration, selectTableIdBounds } from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import { escapeIdentifier, queryRows } from '@prairielearn/postgres';

import { type Course, CourseSchema } from '../../lib/db-types.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { getLockNameForCoursePath } from '../../models/course.js';
import { syncDiskToSqlWithLock } from '../../sync/syncFromDisk.js';

const COURSE_SYNC_BACKFILL_BATCH_SIZE = 10;

type CourseTableName = 'courses' | 'pl_courses';

export function makeCourseSyncBackfillMigration({
  boundsTableName = 'courses',
  coursesTableName = 'courses',
}: { boundsTableName?: CourseTableName; coursesTableName?: CourseTableName } = {}) {
  return makeBatchedMigration({
    async getParameters() {
      const bounds = await selectTableIdBounds(boundsTableName);
      return {
        min: bounds.min,
        max: bounds.max,
        batchSize: COURSE_SYNC_BACKFILL_BATCH_SIZE,
      };
    },

    async execute(min: bigint, max: bigint): Promise<void> {
      const courses = await selectCoursesForSync(coursesTableName, min, max);

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

async function selectCoursesForSync(tableName: CourseTableName, min: bigint, max: bigint) {
  const escapedTableName = escapeIdentifier(tableName);
  return await queryRows(
    `SELECT * FROM ${escapedTableName} WHERE id >= $min AND id <= $max AND deleted_at IS NULL`,
    { min, max },
    CourseSchema,
  );
}

/**
 * Re-syncs an existing course. Does NOT pull new changes from the remote repository.
 */
async function syncCourse(course: Course) {
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
