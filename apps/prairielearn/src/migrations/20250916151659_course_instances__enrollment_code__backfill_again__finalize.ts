import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration(
    '20250916151658_course_instances__enrollment_code__backfill_again',
  );
}
