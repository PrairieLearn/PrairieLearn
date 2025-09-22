/**
 * This is a little silly, since the `joined_at` column was dropped before this was finalized.
 */
import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250822211536_enrollments__joined_at__backfill');
}
