import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250917191821_enrollments__first_joined_at__backfill');
}
