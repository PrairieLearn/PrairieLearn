import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20260120201251_assessments__multiple_instance__backfill');
}
