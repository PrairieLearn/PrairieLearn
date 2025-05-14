import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  // This is similar to the previous batched migration, but for a different time
  // range. This is to backfill data that was incorrectly generated due to the
  // bug fixed by #11590.
  await enqueueBatchedMigration('20250318180548_course_instance_usages__workspaces__backfill_v3');
}
