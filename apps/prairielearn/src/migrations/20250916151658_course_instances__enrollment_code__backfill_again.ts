/**
 * The original backfill was deployed incorrectly.
 *
 * 20250903120000_course_instances__enrollment_code__unique.sql -- was merged around 9/2, and deployed to production.
 * 20250815150052_course_instances__enrollment_code__backfill.ts -- was merged around 9/9, and deployed to production.
 *
 * Locally, the migrations are run in timestamp order:
 *
 * - 20250815150052_course_instances__enrollment_code__backfill
 * - 20250903120000_course_instances__enrollment_code__unique
 *
 * However, `20250903120000_course_instances__enrollment_code__unique` dropped the `enrollment_code` column.
 *
 * This had the effect that in local development, it is as if the backfill was never run. This re-runs the backfill.
 *
 */
import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20250916151658_course_instances__enrollment_code__backfill_again');
}
