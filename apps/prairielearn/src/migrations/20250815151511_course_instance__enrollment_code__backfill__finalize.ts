import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250815150052_course_instance__enrollment_code__backfill');
}
