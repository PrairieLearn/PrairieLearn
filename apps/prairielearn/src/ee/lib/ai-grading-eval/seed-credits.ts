import { type ServerJob } from '../../../lib/server-jobs.js';
import { adjustCreditPool, selectCreditPool } from '../../../models/ai-grading-credit-pool.js';

/**
 * Tops up the synthetic course instance's AI grading credit pool so
 * `aiGrade` doesn't bail out on the `total_milli_dollars <= 0` precondition.
 * Without this, AI grading silently grades zero submissions because the
 * synthetic course was just created with an empty credit pool.
 *
 * Non-transferable so the seed credits can't leak out of the eval course.
 */
export async function seedAiGradingCredits({
  course_instance_id,
  user_id,
  milli_dollars,
  job,
}: {
  course_instance_id: string;
  user_id: string;
  milli_dollars: number;
  job: ServerJob;
}): Promise<void> {
  await adjustCreditPool({
    course_instance_id,
    delta_milli_dollars: milli_dollars,
    credit_type: 'non_transferable',
    user_id,
    reason: 'AI grading eval initial seed',
  });
  const pool = await selectCreditPool(course_instance_id);
  job.info(
    `Seeded AI grading credit pool: $${(pool.total_milli_dollars / 1000).toFixed(2)} total ` +
      `($${(pool.credit_non_transferable_milli_dollars / 1000).toFixed(2)} non-transferable).`,
  );
}
