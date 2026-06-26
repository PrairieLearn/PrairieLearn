import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration(
    '20260624121359_questions__workspace_url_rewrite__null_sync__backfill',
  );
}
