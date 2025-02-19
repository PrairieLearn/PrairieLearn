import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration(
    '20250214171608_course_instance_usages__external_grading_jobs__backfill',
  );
}
