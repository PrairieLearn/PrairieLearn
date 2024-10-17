import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20240812123503_assessment_questions__manual_perc__backfill');
}
