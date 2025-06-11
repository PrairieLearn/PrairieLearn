import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250501105324_ai_grading_job_prompt_backfill');
}
