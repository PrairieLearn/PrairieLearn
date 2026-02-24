import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260214020000_course_instance_usages__submissions__backfill_v4');
}
