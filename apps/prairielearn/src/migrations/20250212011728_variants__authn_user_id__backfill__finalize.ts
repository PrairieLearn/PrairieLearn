import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20250212010945_variants__authn_user_id__backfill');
}
