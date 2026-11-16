import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20261008010001_assessment_instances__pending_score__backfill');
}
