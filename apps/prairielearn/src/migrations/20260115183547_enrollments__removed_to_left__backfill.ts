import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260115183547_enrollments__removed_to_left__backfill');
}
