import { enqueueBatchedMigration } from '@prairielearn/migrations';

/** Requires #16366 to be fully deployed so all rubric item writes populate both columns. */
export default async function () {
  await enqueueBatchedMigration('20261111182500_rubric_items__show_to_students__backfill');
}
