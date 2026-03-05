import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
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

const CreditPoolBalancesSchema = z.object({
  credit_transferable_milli_dollars: z.coerce.number(),
  credit_non_transferable_milli_dollars: z.coerce.number(),
});

/**
 * Get the credit pool balances for a course instance.
 */
export async function selectCreditPool(course_instance_id: string): Promise<CreditPool> {
  return await queryRow(sql.select_credit_pool, { course_instance_id }, CreditPoolSchema);
}

/**
 * Atomically deduct credits from the pool for AI grading.
 * Deducts from non-transferable credits first, then transferable.
 * Throws if the pool has insufficient credits (the UPDATE returns zero rows).
 */
export async function deductCreditsForAiGrading({
  course_instance_id,
  cost_milli_dollars,
  user_id,
  ai_grading_job_id,
  assessment_question_id,
  reason,
}: {
  course_instance_id: string;
  cost_milli_dollars: number;
  user_id: string | null;
  ai_grading_job_id: string | null;
  assessment_question_id: string | null;
  reason: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    // Lock the row and get the current pool state before deduction for logging.
    const before = await queryRow(
      sql.select_credit_pool_for_update,
      { course_instance_id },
      CreditPoolSchema,
    );

    // Atomically deduct; returns null if insufficient credits.
    const result = await queryOptionalRow(
      sql.deduct_credits,
      { course_instance_id, cost_milli_dollars },
      CreditPoolBalancesSchema,
    );

    if (!result) {
      throw new Error('Insufficient AI grading credits');
    }

    const afterTotal =
      result.credit_transferable_milli_dollars + result.credit_non_transferable_milli_dollars;

    // Determine how the deduction was split between pools.
    const nonTransferableDeducted = Math.min(
      cost_milli_dollars,
      before.credit_non_transferable_milli_dollars,
    );
    const transferableDeducted = cost_milli_dollars - nonTransferableDeducted;

    // Log the non-transferable deduction if any.
    if (nonTransferableDeducted > 0) {
      await execute(sql.insert_credit_pool_change, {
        course_instance_id,
        credit_before_milli_dollars: before.total_milli_dollars,
        credit_after_milli_dollars: before.total_milli_dollars - nonTransferableDeducted,
        delta_milli_dollars: -nonTransferableDeducted,
        credit_type: 'non_transferable',
        reason,
        user_id,
        ai_grading_job_id,
        assessment_question_id,
      });
    }

    // Log the transferable deduction if any.
    if (transferableDeducted > 0) {
      await execute(sql.insert_credit_pool_change, {
        course_instance_id,
        credit_before_milli_dollars: before.total_milli_dollars - nonTransferableDeducted,
        credit_after_milli_dollars: afterTotal,
        delta_milli_dollars: -transferableDeducted,
        credit_type: 'transferable',
        reason,
        user_id,
        ai_grading_job_id,
        assessment_question_id,
      });
    }
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
        `Cannot deduct more than the current ${credit_type} balance of $${(currentBalance / 1000).toFixed(2)}.`,
      );
    }

    const newBalance = currentBalance + delta_milli_dollars;

    if (credit_type === 'transferable') {
      await execute(sql.update_credit_transferable, {
        course_instance_id,
        credit_transferable_milli_dollars: newBalance,
      });
    } else {
      await execute(sql.update_credit_non_transferable, {
        course_instance_id,
        credit_non_transferable_milli_dollars: newBalance,
      });
    }

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

export type BatchedCreditPoolChangeRow = z.infer<typeof BatchedCreditPoolChangeRowSchema>;

const CREDIT_POOL_CHANGES_PAGE_SIZE = 25;

export async function selectCreditPoolChangesBatched(
  course_instance_id: string,
  page: number,
): Promise<{ rows: BatchedCreditPoolChangeRow[]; totalCount: number }> {
  const offset = (page - 1) * CREDIT_POOL_CHANGES_PAGE_SIZE;
  const rows = await queryRows(
    sql.select_credit_pool_changes_batched,
    { course_instance_id, limit: CREDIT_POOL_CHANGES_PAGE_SIZE, offset },
    BatchedCreditPoolChangeRowSchema,
  );
  const totalCount = rows.length > 0 ? rows[0].total_count : 0;
  return { rows, totalCount };
}

const BalanceTimeSeriesPointSchema = z.object({
  date: z.coerce.date(),
  balance_milli_dollars: z.coerce.number(),
});

type BalanceTimeSeriesPoint = z.infer<typeof BalanceTimeSeriesPointSchema>;

export async function selectCreditPoolBalanceTimeSeries(
  course_instance_id: string,
): Promise<BalanceTimeSeriesPoint[]> {
  return await queryRows(
    sql.select_credit_pool_balance_time_series,
    { course_instance_id },
    BalanceTimeSeriesPointSchema,
  );
}
