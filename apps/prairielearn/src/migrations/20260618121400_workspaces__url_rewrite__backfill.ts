import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260618121400_workspaces__url_rewrite__backfill');
}
