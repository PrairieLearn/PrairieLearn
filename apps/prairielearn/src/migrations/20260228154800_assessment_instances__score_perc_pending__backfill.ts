import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration(
    '20260228154800_assessment_instances__score_perc_pending__backfill',
  );
}
