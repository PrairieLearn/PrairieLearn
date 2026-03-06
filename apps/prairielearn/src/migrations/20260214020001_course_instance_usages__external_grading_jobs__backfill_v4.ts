import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration(
    '20260214020001_course_instance_usages__external_grading_jobs__backfill_v4',
  );
}
