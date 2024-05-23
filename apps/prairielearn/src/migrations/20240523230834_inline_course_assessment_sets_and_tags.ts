import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20240523230834_inline_course_assessment_sets_and_tags');
}
