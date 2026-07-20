import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260720173206_enrollments__lti_managed__null_backfill');
}
