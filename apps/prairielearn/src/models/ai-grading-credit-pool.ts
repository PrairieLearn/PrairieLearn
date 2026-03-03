import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { AiGradingCreditPoolChangeSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const CreditPoolSchema = z.object({
  credit_transferable_milli_dollars: z.coerce.number(),
  credit_non_transferable_milli_dollars: z.coerce.number(),
  total_milli_dollars: z.coerce.number(),
});

export type CreditPool = z.infer<typeof CreditPoolSchema>;

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
}: {
  course_instance_id: string;
  cost_milli_dollars: number;
  user_id: string | null;
  ai_grading_job_id: string | null;
  assessment_question_id: string | null;
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
        reason: 'AI grading',
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
        reason: 'AI grading',
        user_id,
        ai_grading_job_id,
        assessment_question_id,
      });
    }
  });
}

/**
 * Update the credit pool for a course instance (admin operation).
 * Logs changes for each pool that is modified.
 */
export async function updateCreditPool({
  course_instance_id,
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars,
  user_id,
  reason,
}: {
  course_instance_id: string;
  credit_transferable_milli_dollars: number;
  credit_non_transferable_milli_dollars: number;
  user_id: string;
  reason: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    const before = await queryRow(sql.select_credit_pool, { course_instance_id }, CreditPoolSchema);

    const transferableDelta =
      credit_transferable_milli_dollars - before.credit_transferable_milli_dollars;
    const nonTransferableDelta =
      credit_non_transferable_milli_dollars - before.credit_non_transferable_milli_dollars;

    let runningTotal = before.total_milli_dollars;

    if (transferableDelta !== 0) {
      await execute(sql.update_credit_transferable, {
        course_instance_id,
        credit_transferable_milli_dollars,
      });

      await execute(sql.insert_credit_pool_change, {
        course_instance_id,
        credit_before_milli_dollars: runningTotal,
        credit_after_milli_dollars: runningTotal + transferableDelta,
        delta_milli_dollars: transferableDelta,
        credit_type: 'transferable',
        reason,
        user_id,
        ai_grading_job_id: null,
        assessment_question_id: null,
      });

      runningTotal += transferableDelta;
    }

    if (nonTransferableDelta !== 0) {
      await execute(sql.update_credit_non_transferable, {
        course_instance_id,
        credit_non_transferable_milli_dollars,
      });

      await execute(sql.insert_credit_pool_change, {
        course_instance_id,
        credit_before_milli_dollars: runningTotal,
        credit_after_milli_dollars: runningTotal + nonTransferableDelta,
        delta_milli_dollars: nonTransferableDelta,
        credit_type: 'non_transferable',
        reason,
        user_id,
        ai_grading_job_id: null,
        assessment_question_id: null,
      });
    }
  });
}

const CreditPoolChangeWithUserSchema = AiGradingCreditPoolChangeSchema.extend({
  user_name: z.string().nullable(),
  user_uid: z.string().nullable(),
});

export type CreditPoolChangeWithUser = z.infer<typeof CreditPoolChangeWithUserSchema>;

/**
 * Get the credit pool change history for a course instance, ordered by most recent first.
 */
export async function selectCreditPoolChanges(
  course_instance_id: string,
): Promise<CreditPoolChangeWithUser[]> {
  return await queryRows(
    sql.select_credit_pool_changes,
    { course_instance_id },
    CreditPoolChangeWithUserSchema,
  );
}

const BalanceTimeSeriesPointSchema = z.object({
  date: z.coerce.date(),
  balance_milli_dollars: z.coerce.number(),
});

export type BalanceTimeSeriesPoint = z.infer<typeof BalanceTimeSeriesPointSchema>;

/**
 * Get daily end-of-day balance snapshots for the credit pool chart.
 */
export async function selectCreditPoolBalanceTimeSeries(
  course_instance_id: string,
): Promise<BalanceTimeSeriesPoint[]> {
  return await queryRows(
    sql.select_credit_pool_balance_time_series,
    { course_instance_id },
    BalanceTimeSeriesPointSchema,
  );
}

const PerUserSpendSchema = z.object({
  user_id: z.string(),
  user_name: z.string().nullable(),
  uid: z.string(),
  total_cost_milli_dollars: z.coerce.number(),
});

export type PerUserSpend = z.infer<typeof PerUserSpendSchema>;

/**
 * Get per-user AI grading spend for a course instance.
 */
export async function selectPerUserAiGradingSpend(
  course_instance_id: string,
): Promise<PerUserSpend[]> {
  return await queryRows(sql.select_per_user_spend, { course_instance_id }, PerUserSpendSchema);
}

const PerAssessmentSpendSchema = z.object({
  assessment_id: z.string(),
  assessment_label: z.string(),
  total_cost_milli_dollars: z.coerce.number(),
});

export type PerAssessmentSpend = z.infer<typeof PerAssessmentSpendSchema>;

/**
 * Get per-assessment AI grading spend for a course instance.
 */
export async function selectPerAssessmentAiGradingSpend(
  course_instance_id: string,
): Promise<PerAssessmentSpend[]> {
  return await queryRows(
    sql.select_per_assessment_spend,
    { course_instance_id },
    PerAssessmentSpendSchema,
  );
}

const PerQuestionSpendSchema = z.object({
  question_id: z.string(),
  question_qid: z.string(),
  question_title: z.string().nullable(),
  total_cost_milli_dollars: z.coerce.number(),
});

export type PerQuestionSpend = z.infer<typeof PerQuestionSpendSchema>;

/**
 * Get per-question AI grading spend for a course instance.
 */
export async function selectPerQuestionAiGradingSpend(
  course_instance_id: string,
): Promise<PerQuestionSpend[]> {
  return await queryRows(
    sql.select_per_question_spend,
    { course_instance_id },
    PerQuestionSpendSchema,
  );
}

/**
 * Get the number of enrolled students (non-instructors) in a course instance.
 */
export async function selectEnrollmentCount(course_instance_id: string): Promise<number> {
  const result = await queryRow(
    sql.select_enrollment_count,
    { course_instance_id },
    z.object({ enrollment_count: z.number() }),
  );
  return result.enrollment_count;
}
