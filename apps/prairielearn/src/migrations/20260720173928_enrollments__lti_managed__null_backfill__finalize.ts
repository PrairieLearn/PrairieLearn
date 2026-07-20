import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20260720173206_enrollments__lti_managed__null_backfill');
}
