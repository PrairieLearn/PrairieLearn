import { enqueueBatchedMigration } from '@prairielearn/migrations';

/** Deploy pending-score writers to every server before deploying this enqueue migration. */
export default async function () {
  await enqueueBatchedMigration('20261008010001_assessment_instances__pending_score__backfill');
}
