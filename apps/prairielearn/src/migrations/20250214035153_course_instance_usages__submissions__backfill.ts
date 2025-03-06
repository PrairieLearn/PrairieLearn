import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250214035153_course_instance_usages__submissions__backfill');
}
