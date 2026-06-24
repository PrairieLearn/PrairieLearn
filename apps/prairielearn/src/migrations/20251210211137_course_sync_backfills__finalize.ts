import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20240523183853_sync_courses_for_implicit_flag');
  await finalizeBatchedMigration('20250502181707_json_columns__backfill');
  await finalizeBatchedMigration('20250930221841_json_points_fields__backfill');
}
