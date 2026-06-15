import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  // This is similar to the previous batched migration, but for a different time
  // range. This is to backfill data that was incorrectly generated due to the
  // bug fixed by #11590.
  await enqueueBatchedMigration(
    '20250318175247_course_instance_usages__external_grading_jobs__backfill_v3',
  );
}
