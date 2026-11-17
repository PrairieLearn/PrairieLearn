import { z } from 'zod';

import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

import { adjustCreditPool } from '../../models/ai-grading-credit-pool.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import {
  FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
  MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE,
} from '../lib/ai-grading-free-credit-constants.js';

const sql = loadSqlEquiv(import.meta.url);

const RedemptionsUsedSchema = z.object({
  ai_grading_free_credit_redemptions_used: z.number(),
});

/**
 * Thrown by {@link redeemFreeAiGradingCredit} when the course has already
 * used all of its free credit redemptions. Callers should translate this to
 * a user-facing error (e.g. tRPC `PRECONDITION_FAILED`).
 */
export class FreeCreditRedemptionCapReachedError extends Error {
  constructor() {
    super(
      `This course has already used all ${MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE} free AI grading credit redemptions.`,
    );
    this.name = 'FreeCreditRedemptionCapReachedError';
  }
}

export async function selectCourseFreeCreditRedemptionsUsed(course_id: string): Promise<number> {
  const row = await queryRow(
    sql.select_course_free_credit_redemptions_used,
    { course_id },
    RedemptionsUsedSchema,
  );
  return row.ai_grading_free_credit_redemptions_used;
}

/**
 * Redeem one free AI grading credit for a course. The redemption counter lives
 * at the course level (lifetime cap of
 * {@link MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE} across all course
 * instances), but the credit is added to the specified course instance's pool.
 *
 * Locks the course row FOR NO KEY UPDATE before checking the cap to serialize
 * concurrent redemptions from the same course without blocking foreign-key
 * references to the course. Adds non-transferable credit so the free credit
 * cannot be refunded or carried across course instances.
 */
export async function redeemFreeAiGradingCredit({
  course_id,
  course_instance_id,
  user_id,
}: {
  course_id: string;
  course_instance_id: string;
  user_id: string;
}): Promise<{
  redemptions_used: number;
  redemptions_remaining: number;
  amount_milli_dollars: number;
}> {
  return await runInTransactionAsync(async () => {
    const before = await queryRow(
      sql.select_course_free_credit_redemptions_used_for_no_key_update,
      { course_id },
      RedemptionsUsedSchema,
    );

    if (
      before.ai_grading_free_credit_redemptions_used >=
      MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE
    ) {
      throw new FreeCreditRedemptionCapReachedError();
    }

    const after = await queryRow(
      sql.increment_course_free_credit_redemptions,
      { course_id },
      RedemptionsUsedSchema,
    );

    await adjustCreditPool({
      course_instance_id,
      delta_milli_dollars: FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
      credit_type: 'non_transferable',
      user_id,
      reason: 'Free credit redemption',
    });

    await insertAuditEvent({
      tableName: 'courses',
      action: 'update',
      actionDetail: 'ai_grading_free_credit_redemption',
      rowId: course_id,
      agentAuthnUserId: user_id,
      agentUserId: user_id,
      courseId: course_id,
      courseInstanceId: course_instance_id,
      oldRow: {
        ai_grading_free_credit_redemptions_used: before.ai_grading_free_credit_redemptions_used,
      },
      newRow: {
        ai_grading_free_credit_redemptions_used: after.ai_grading_free_credit_redemptions_used,
      },
      context: {
        amount_milli_dollars: FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
      },
    });

    return {
      redemptions_used: after.ai_grading_free_credit_redemptions_used,
      redemptions_remaining:
        MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE -
        after.ai_grading_free_credit_redemptions_used,
      amount_milli_dollars: FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
    };
  });
}
