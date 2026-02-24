import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260212202738_questions__external_grading_enabled__backfill');
}
