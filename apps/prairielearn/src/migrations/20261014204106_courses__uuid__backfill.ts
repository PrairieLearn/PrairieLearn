import { enqueueBatchedMigration } from '@prairielearn/migrations';

/**
 * Requires #16019 to be fully deployed so new courses already receive UUIDs.
 * Finalization and constraints follow after this backfill completes (#15996).
 */
export default async function () {
  await enqueueBatchedMigration('20261014204106_courses__uuid__backfill');
}
