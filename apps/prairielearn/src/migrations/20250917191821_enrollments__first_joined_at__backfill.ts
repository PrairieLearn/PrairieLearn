import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250917191821_enrollments__first_joined_at__backfill');
}
