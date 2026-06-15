import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250930221841_json_points_fields__backfill');
}
