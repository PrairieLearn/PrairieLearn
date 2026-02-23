import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20260214020002_course_instance_usages__workspaces__backfill_v4');
}
