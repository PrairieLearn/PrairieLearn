import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration(
    '20250908181518_assessments__json_allow_real_time_grading__backfill',
  );
}
