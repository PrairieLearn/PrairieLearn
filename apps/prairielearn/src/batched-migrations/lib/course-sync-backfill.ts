import { z } from 'zod';

import { makeBatchedMigration, selectTableIdBounds } from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import { escapeIdentifier, queryRows, queryScalar } from '@prairielearn/postgres';

import { type Course, CourseSchema } from '../../lib/db-types.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { getLockNameForCoursePath } from '../../models/course.js';
import { syncDiskToSqlWithLock } from '../../sync/syncFromDisk.js';

const COURSE_SYNC_BACKFILL_BATCH_SIZE = 10;

const COURSE_TABLE_NAMES = ['pl_courses', 'courses'] as const;

type CourseTableName = (typeof COURSE_TABLE_NAMES)[number];

export function makeCourseSyncBackfillMigration() {
  return makeBatchedMigration({
    async getParameters() {
      const courseTableName = await selectExistingCourseTableName();
      const bounds = await selectTableIdBounds(courseTableName);
      return {
        min: bounds.min,
        max: bounds.max,
        batchSize: COURSE_SYNC_BACKFILL_BATCH_SIZE,
      };
    },

    async execute(min: bigint, max: bigint): Promise<void> {
      const courses = await selectCoursesForSync(min, max);

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

async function selectCoursesForSync(min: bigint, max: bigint) {
  const existingTableName = await selectExistingCourseTableName();
  const escapedTableName = escapeIdentifier(existingTableName);
  return await queryRows(
    `SELECT * FROM ${escapedTableName} WHERE id >= $min AND id <= $max AND deleted_at IS NULL`,
    { min, max },
    CourseSchema,
  );
}

async function selectExistingCourseTableName() {
  for (const tableName of COURSE_TABLE_NAMES) {
    if (await courseTableExists(tableName)) return tableName;
  }

  throw new Error(`Could not find any usable course table (${COURSE_TABLE_NAMES.join(', ')})`);
}

async function courseTableExists(tableName: CourseTableName) {
  return await queryScalar(
    `
    SELECT
      to_regclass($table_name) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = to_regclass($table_name)
        AND attname = 'id'
        AND NOT attisdropped
      )
      AND EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = to_regclass($table_name)
        AND attname = 'deleted_at'
        AND NOT attisdropped
      )
    `,
    { table_name: tableName },
    z.boolean(),
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
