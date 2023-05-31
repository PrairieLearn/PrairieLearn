import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20230418190511_variants_course_id');
}
