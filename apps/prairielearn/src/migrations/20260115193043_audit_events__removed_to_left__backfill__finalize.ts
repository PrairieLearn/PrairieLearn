import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20260115185721_audit_events__removed_to_left__backfill');
}
