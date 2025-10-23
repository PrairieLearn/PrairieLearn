import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250924190750_course_instances__modern_publishing__backfill');
}
