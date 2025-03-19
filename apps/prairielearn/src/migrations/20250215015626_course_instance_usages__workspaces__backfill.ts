import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250215015626_course_instance_usages__workspaces__backfill');
}
