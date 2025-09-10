import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250815150052_course_instances__enrollment_code__backfill');
}
