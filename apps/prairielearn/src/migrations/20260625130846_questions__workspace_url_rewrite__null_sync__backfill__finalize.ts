import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration(
    '20260624121359_questions__workspace_url_rewrite__null_sync__backfill',
  );
}
