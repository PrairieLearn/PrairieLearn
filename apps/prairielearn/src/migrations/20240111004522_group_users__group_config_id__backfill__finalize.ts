import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20240108185602_group_users__group_config_id__backfill');
}
