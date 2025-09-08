import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration(
    '20250908181519_assessment_questions__allow_real_time_grading__backfill',
  );
}
