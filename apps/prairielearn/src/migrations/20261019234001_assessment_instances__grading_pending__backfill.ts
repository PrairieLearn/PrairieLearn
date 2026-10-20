import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20261019234001_assessment_instances__grading_pending__backfill');
}
