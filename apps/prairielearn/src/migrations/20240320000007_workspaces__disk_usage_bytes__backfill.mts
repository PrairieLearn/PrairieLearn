import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20240320000007_workspaces__disk_usage_bytes__backfill');
}
