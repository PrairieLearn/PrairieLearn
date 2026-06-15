import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20260124011218_assessments__type__backfill');
}
