import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250514233007_submissions__modified_at__backfill');
}
