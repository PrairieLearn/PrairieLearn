import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250815150052_course_instances__enrollment_code__backfill');
}
