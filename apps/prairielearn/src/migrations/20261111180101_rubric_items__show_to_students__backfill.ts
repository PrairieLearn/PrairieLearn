import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20261111180101_rubric_items__show_to_students__backfill');
}
