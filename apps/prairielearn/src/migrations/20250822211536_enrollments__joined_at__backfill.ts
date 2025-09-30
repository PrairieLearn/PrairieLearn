import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250822211536_enrollments__joined_at__add__backfill');
}
