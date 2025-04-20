import { makeBatchedMigration } from '@prairielearn/migrations';
import * as namedLocks from '@prairielearn/named-locks';
import { queryOneRowAsync, queryRows } from '@prairielearn/postgres';

import { type Course, CourseSchema } from '../lib/db-types.js';
import { createServerJob } from '../lib/server-jobs.js';
import { getLockNameForCoursePath } from '../models/course.js';
import { syncDiskToSqlWithLock } from '../sync/syncFromDisk.js';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from pl_courses;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 10,
    };
  },

  async execute(min: bigint, max: bigint): Promise<void> {
    const courses = await queryRows(
      'SELECT * FROM pl_courses WHERE id >= $min AND id <= $max AND deleted_at IS NULL',
      { min, max },
      CourseSchema,
    );

    for (const course of courses) {
      await syncCourse(course);
    }
  },
});

/**
 * Re-syncs an existing course. Does NOT pull new changes from the remote repository.
 */
export async function syncCourse(course: Course) {
  const serverJob = await createServerJob({
    courseId: course.id,
    type: 'sync',
    description: 'Sync from disk',
    // Since this is a sync performed by the system, don't associate any user
    // with it.
    userId: undefined,
    authnUserId: undefined,
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
        await syncDiskToSqlWithLock(course.id, course.path, job);
      },
    );
  });
}
