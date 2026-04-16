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
export async function selectCreditPoolForUpdate(course_instance_id: string): Promise<CreditPool> {
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

/**
 * Returns the amount actually deducted (which may be less than
 * `cost_milli_dollars` if the pool didn't have enough credits).
 *
 * Callers must ensure $0 balances are caught *before* making API calls
 * (see the batch-level and per-submission checks in ai-grading.ts).
 * This function intentionally does not throw on insufficient balance:
 * by the time it runs the API cost has already been incurred, so
 * rejecting the grading result would waste the spend. Instead, we
 * deduct whatever remains and let the grading succeed.
 */
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
): Promise<number> {
  if (before.total_milli_dollars <= 0) {
    return 0;
  }

  // Clamp to available balance.
  const effectiveCost = Math.min(cost_milli_dollars, before.total_milli_dollars);

  const { nonTransferableDeduction, transferableDeduction } = splitDeduction(
    effectiveCost,
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
      checkout_session_id: null,
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
      checkout_session_id: null,
    });
  }

  return effectiveCost;
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
 *
 * This function does NOT throw on insufficient credits. By the time it runs,
 * the LLM API call has already been made and the cost incurred, so rejecting
 * the result would waste that spend. Callers must guard against $0 balances
 * before making API calls (see the batch-level and per-submission credit
 * checks in ai-grading.ts).
 *
 * @returns `{ ai_grading_job_id, deducted_milli_dollars }` — the amount
 * actually deducted, which may be less than `cost_milli_dollars` if the pool
 * was partially depleted.
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
}): Promise<{ ai_grading_job_id: string; deducted_milli_dollars: number }> {
  return await runInTransactionAsync(async () => {
    const creditPool = trackRateLimitAndCost
      ? await selectCreditPoolForUpdate(course_instance_id)
      : null;

    const ai_grading_job_id = await createAiGradingJob();

    let deducted_milli_dollars = 0;
    if (creditPool) {
      deducted_milli_dollars = await deductCreditsForAiGradingWithLockedPool(creditPool, {
        course_instance_id,
        cost_milli_dollars,
        user_id,
        ai_grading_job_id,
        assessment_question_id,
        reason,
      });
    }

    return { ai_grading_job_id, deducted_milli_dollars };
  });
}

/**
 * Atomically deduct credits from the pool for AI grading.
 * Deducts from non-transferable credits first, then transferable.
 *
 * If the pool has insufficient credits, clamps the deduction to
 * the remaining balance rather than throwing.
 *
 * Exported for testing. Production callers should use
 * {@link insertAiGradingJobAndDeductCreditsIfNeeded} instead to ensure
 * correct lock ordering and avoid deadlocks.
 *
 * @returns The amount actually deducted (may be less than `cost_milli_dollars`).
 */
export async function deductCreditsForAiGrading(
  params: DeductCreditsForAiGradingParams,
): Promise<number> {
  return await runInTransactionAsync(async () => {
    const before = await selectCreditPoolForUpdate(params.course_instance_id);
    return await deductCreditsForAiGradingWithLockedPool(before, params);
  });
}

/**
 * Adjust the credit pool for a course instance by a delta amount (admin operation).
 * Positive delta adds credits, negative delta removes credits.
 * If a deduction exceeds the selected pool balance, the deduction is capped
 * to the remaining balance so balances never go negative.
 */
export async function adjustCreditPool({
  course_instance_id,
  delta_milli_dollars,
  credit_type,
  user_id,
  reason,
  checkout_session_id,
}: {
  course_instance_id: string;
  delta_milli_dollars: number;
  credit_type: 'transferable' | 'non_transferable';
  user_id: string;
  reason: string;
  checkout_session_id?: string | null;
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

    // Cap deductions so the balance doesn't go negative.
    const cappedDelta = Math.max(delta_milli_dollars, -currentBalance);

    if (cappedDelta === 0) return;

    await execute(sql.update_credit_balances, {
      course_instance_id,
      credit_transferable_milli_dollars:
        before.credit_transferable_milli_dollars +
        (credit_type === 'transferable' ? cappedDelta : 0),
      credit_non_transferable_milli_dollars:
        before.credit_non_transferable_milli_dollars +
        (credit_type === 'non_transferable' ? cappedDelta : 0),
    });

    await execute(sql.insert_credit_pool_change, {
      course_instance_id,
      credit_before_milli_dollars: before.total_milli_dollars,
      credit_after_milli_dollars: before.total_milli_dollars + cappedDelta,
      delta_milli_dollars: cappedDelta,
      credit_type,
      reason,
      user_id,
      ai_grading_job_id: null,
      assessment_question_id: null,
      checkout_session_id: checkout_session_id ?? null,
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
  checkout_session_id: z.coerce.string().nullable(),
  checkout_session_refunded_at: z.coerce.date().nullable(),
  checkout_session_amount_milli_dollars: z.coerce.number().nullable(),
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
