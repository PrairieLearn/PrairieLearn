import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const CreditPoolSchema = z.object({
  credit_transferable_milli_dollars: z.coerce.number(),
  credit_non_transferable_milli_dollars: z.coerce.number(),
  total_milli_dollars: z.coerce.number(),
});

type CreditPool = z.infer<typeof CreditPoolSchema>;

/**
 * Get the credit pool balances for a course instance.
 */
export async function selectCreditPool(course_instance_id: string): Promise<CreditPool> {
  return await queryRow(sql.select_credit_pool, { course_instance_id }, CreditPoolSchema);
}

/**
 * Lock the course_instances row for this course instance before writing AI
 * grading rows that reference it.
 *
 * AI grading transactions are deadlock-prone here because concurrent workers on
 * the same course instance insert into ai_grading_jobs (taking FK KEY SHARE on
 * course_instances) and then deduct credits (requiring FOR UPDATE on that same
 * row). We call this immediately before ai_grading_jobs insert so FOR UPDATE is
 * taken first and no lock upgrade cycle is created.
 */
async function selectCreditPoolForUpdate(course_instance_id: string): Promise<CreditPool> {
  return await queryRow(
    sql.select_credit_pool_for_update,
    { course_instance_id },
    CreditPoolSchema,
  );
}

/**
 * Compute how a cost should be split between non-transferable (first) and transferable credits.
 */
function splitDeduction(
  cost: number,
  nonTransferableBalance: number,
): { nonTransferableDeduction: number; transferableDeduction: number } {
  const nonTransferableDeduction = Math.min(cost, nonTransferableBalance);
  const transferableDeduction = cost - nonTransferableDeduction;
  return { nonTransferableDeduction, transferableDeduction };
}

interface DeductCreditsForAiGradingParams {
  course_instance_id: string;
  cost_milli_dollars: number;
  user_id: string | null;
  ai_grading_job_id: string | null;
  assessment_question_id: string | null;
  reason: string;
}

async function deductCreditsForAiGradingWithLockedPool(
  before: CreditPool,
  {
    course_instance_id,
    cost_milli_dollars,
    user_id,
    ai_grading_job_id,
    assessment_question_id,
    reason,
  }: DeductCreditsForAiGradingParams,
): Promise<void> {
  if (before.total_milli_dollars < cost_milli_dollars) {
    throw new Error('Insufficient AI grading credits');
  }

  const { nonTransferableDeduction, transferableDeduction } = splitDeduction(
    cost_milli_dollars,
    before.credit_non_transferable_milli_dollars,
  );

  const newNonTransferable =
    before.credit_non_transferable_milli_dollars - nonTransferableDeduction;
  const newTransferable = before.credit_transferable_milli_dollars - transferableDeduction;
  const newTotal = newNonTransferable + newTransferable;

  await execute(sql.update_credit_balances, {
    course_instance_id,
    credit_transferable_milli_dollars: newTransferable,
    credit_non_transferable_milli_dollars: newNonTransferable,
  });

  if (nonTransferableDeduction > 0) {
    await execute(sql.insert_credit_pool_change, {
      course_instance_id,
      credit_before_milli_dollars: before.total_milli_dollars,
      credit_after_milli_dollars: before.total_milli_dollars - nonTransferableDeduction,
      delta_milli_dollars: -nonTransferableDeduction,
      credit_type: 'non_transferable',
      reason,
      user_id,
      ai_grading_job_id,
      assessment_question_id,
    });
  }

  if (transferableDeduction > 0) {
    await execute(sql.insert_credit_pool_change, {
      course_instance_id,
      credit_before_milli_dollars: before.total_milli_dollars - nonTransferableDeduction,
      credit_after_milli_dollars: newTotal,
      delta_milli_dollars: -transferableDeduction,
      credit_type: 'transferable',
      reason,
      user_id,
      ai_grading_job_id,
      assessment_question_id,
    });
  }
}

/**
 * Run AI grading job insertion and credit deduction under one consistent lock
 * order. When cost tracking is enabled, this takes FOR UPDATE on
 * course_instances before ai_grading_jobs is inserted, avoiding FK KEY SHARE ->
 * FOR UPDATE deadlocks under parallel grading.
 *
 * This function opens its own transaction, but is safe to call inside an
 * existing `runInTransactionAsync` — the nested call reuses the outer
 * transaction. In that case, the FOR UPDATE lock is held for the lifetime of
 * the *outer* transaction, not just this function.
 */
export async function insertAiGradingJobAndDeductCreditsIfNeeded({
  trackRateLimitAndCost,
  createAiGradingJob,
  course_instance_id,
  cost_milli_dollars,
  user_id,
  assessment_question_id,
  reason,
}: Omit<DeductCreditsForAiGradingParams, 'ai_grading_job_id'> & {
  trackRateLimitAndCost: boolean;
  createAiGradingJob: () => Promise<string>;
}): Promise<string> {
  return await runInTransactionAsync(async () => {
    const creditPool = trackRateLimitAndCost
      ? await selectCreditPoolForUpdate(course_instance_id)
      : null;

    const ai_grading_job_id = await createAiGradingJob();

    if (creditPool) {
      await deductCreditsForAiGradingWithLockedPool(creditPool, {
        course_instance_id,
        cost_milli_dollars,
        user_id,
        ai_grading_job_id,
        assessment_question_id,
        reason,
      });
    }

    return ai_grading_job_id;
  });
}

/**
 * Atomically deduct credits from the pool for AI grading.
 * Deducts from non-transferable credits first, then transferable.
 * Throws if the pool has insufficient credits.
 *
 * Exported for testing. Production callers should use
 * {@link insertAiGradingJobAndDeductCreditsIfNeeded} instead to ensure
 * correct lock ordering and avoid deadlocks.
 */
export async function deductCreditsForAiGrading(
  params: DeductCreditsForAiGradingParams,
): Promise<void> {
  await runInTransactionAsync(async () => {
    const before = await selectCreditPoolForUpdate(params.course_instance_id);
    await deductCreditsForAiGradingWithLockedPool(before, params);
  });
}

/**
 * Adjust the credit pool for a course instance by a delta amount (admin operation).
 * Positive delta adds credits, negative delta removes credits.
 * Throws if the resulting balance would be negative.
 */
export async function adjustCreditPool({
  course_instance_id,
  delta_milli_dollars,
  credit_type,
  user_id,
  reason,
}: {
  course_instance_id: string;
  delta_milli_dollars: number;
  credit_type: 'transferable' | 'non_transferable';
  user_id: string;
  reason: string;
}): Promise<void> {
  if (delta_milli_dollars === 0) return;

  await runInTransactionAsync(async () => {
    const before = await queryRow(
      sql.select_credit_pool_for_update,
      { course_instance_id },
      CreditPoolSchema,
    );

    const currentBalance =
      credit_type === 'transferable'
        ? before.credit_transferable_milli_dollars
        : before.credit_non_transferable_milli_dollars;

    if (currentBalance + delta_milli_dollars < 0) {
      throw new Error(
        `Cannot deduct more than the current ${credit_type.replace('_', '-')} balance of $${(currentBalance / 1000).toFixed(2)}.`,
      );
    }

    await execute(sql.update_credit_balances, {
      course_instance_id,
      credit_transferable_milli_dollars:
        before.credit_transferable_milli_dollars +
        (credit_type === 'transferable' ? delta_milli_dollars : 0),
      credit_non_transferable_milli_dollars:
        before.credit_non_transferable_milli_dollars +
        (credit_type === 'non_transferable' ? delta_milli_dollars : 0),
    });

    await execute(sql.insert_credit_pool_change, {
      course_instance_id,
      credit_before_milli_dollars: before.total_milli_dollars,
      credit_after_milli_dollars: before.total_milli_dollars + delta_milli_dollars,
      delta_milli_dollars,
      credit_type,
      reason,
      user_id,
      ai_grading_job_id: null,
      assessment_question_id: null,
    });
  });
}

const BatchedCreditPoolChangeRowSchema = z.object({
  id: z.coerce.string(),
  job_sequence_id: z.coerce.string().nullable(),
  created_at: z.coerce.date(),
  delta_milli_dollars: z.coerce.number(),
  credit_after_milli_dollars: z.coerce.number(),
  submission_count: z.coerce.number(),
  reason: z.string(),
  user_name: z.string().nullable(),
  user_uid: z.string().nullable(),
  total_count: z.coerce.number(),
});

type BatchedCreditPoolChangeRow = z.infer<typeof BatchedCreditPoolChangeRowSchema>;

const CREDIT_POOL_CHANGES_PAGE_SIZE = 25;

export async function selectCreditPoolChangesBatched(
  course_instance_id: string,
  page: number,
): Promise<{ rows: BatchedCreditPoolChangeRow[]; totalCount: number }> {
  const offset = (page - 1) * CREDIT_POOL_CHANGES_PAGE_SIZE;
  const rows = await queryRows(
    sql.select_credit_pool_changes_batched,
    {
      course_instance_id,
      limit: CREDIT_POOL_CHANGES_PAGE_SIZE,
      offset,
    },
    BatchedCreditPoolChangeRowSchema,
  );
  const totalCount = rows.length > 0 ? rows[0].total_count : 0;
  return { rows, totalCount };
}

const DailySpendingPointSchema = z.object({
  date: z.coerce.date(),
  spending_milli_dollars: z.coerce.number(),
});

type DailySpendingPoint = z.infer<typeof DailySpendingPointSchema>;

function computeDateRange(days: number): { start_date: string; end_date: string } {
  const now = Temporal.Now.zonedDateTimeISO('UTC');
  const startOfToday = now.startOfDay();
  const startDate = startOfToday.subtract({ days: days - 1 });
  const endDate = startOfToday.add({ hours: 23, minutes: 59, seconds: 59 });

  return {
    start_date: startDate.toInstant().toString(),
    end_date: endDate.toInstant().toString(),
  };
}

export async function selectDailySpending(
  course_instance_id: string,
  days: number,
): Promise<DailySpendingPoint[]> {
  const { start_date, end_date } = computeDateRange(days);
  return await queryRows(
    sql.select_daily_spending,
    { course_instance_id, start_date, end_date },
    DailySpendingPointSchema,
  );
}

const GroupedDailySpendingPointSchema = z.object({
  date: z.coerce.date(),
  group_label: z.string(),
  spending_milli_dollars: z.coerce.number(),
});

type GroupedDailySpendingPoint = z.infer<typeof GroupedDailySpendingPointSchema>;

export async function selectDailySpendingGrouped(
  course_instance_id: string,
  days: number,
  group_by: 'user' | 'assessment' | 'question',
): Promise<GroupedDailySpendingPoint[]> {
  const { start_date, end_date } = computeDateRange(days);
  return await queryRows(
    sql.select_daily_spending_grouped,
    { course_instance_id, start_date, end_date, group_by },
    GroupedDailySpendingPointSchema,
  );
}
