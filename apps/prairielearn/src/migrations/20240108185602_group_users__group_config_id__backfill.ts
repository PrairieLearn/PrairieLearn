import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20240108185602_group_users__group_config_id__backfill');
}
