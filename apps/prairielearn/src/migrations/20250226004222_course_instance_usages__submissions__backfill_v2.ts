import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250226004222_course_instance_usages__submissions__backfill_v2');
}
