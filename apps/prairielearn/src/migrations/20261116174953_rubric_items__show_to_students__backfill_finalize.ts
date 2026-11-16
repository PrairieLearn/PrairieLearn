import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20261111182500_rubric_items__show_to_students__backfill');
}
