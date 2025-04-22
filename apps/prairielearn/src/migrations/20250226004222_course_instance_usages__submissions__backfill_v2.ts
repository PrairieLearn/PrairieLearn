import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  // The original batched migration had a bug that produced incorrect data.
  // This migration is identical, including the cutoff data, except for the
  // fact that the bug is fixed.
  //
  // See the note in the batched migration's SQL file for more details.
  await enqueueBatchedMigration('20250226004222_course_instance_usages__submissions__backfill_v2');
}
