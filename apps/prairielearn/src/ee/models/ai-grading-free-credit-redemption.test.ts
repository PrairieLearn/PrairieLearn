import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectCreditPool } from '../../models/ai-grading-credit-pool.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';
import {
  FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
  MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE,
} from '../lib/ai-grading-free-credit-constants.js';

import {
  redeemFreeAiGradingCredit,
  selectCourseFreeCreditRedemptionsUsed,
} from './ai-grading-free-credit-redemption.js';

const sql = loadSqlEquiv(import.meta.url);

const COURSE_ID = '1';
const COURSE_INSTANCE_ID = '1';

async function insertSecondCourseInstance() {
  return await queryScalar(
    sql.insert_course_instance,
    {
      course_id: COURSE_ID,
      short_name: 'CI-2',
      long_name: 'Second Course Instance',
      display_timezone: 'America/Chicago',
      enrollment_code: 'TESTCI-002',
    },
    IdSchema,
  );
}

async function createTestUser() {
  const user = await getOrCreateUser({
    uid: 'free-credit-user@example.com',
    name: 'Free Credit User',
    uin: 'freecredit',
    email: 'free-credit-user@example.com',
  });
  return user.id;
}

describe('ai-grading-free-credit-redemption', () => {
  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async () => {
    await helperDb.after();
  });

  it('adds non-transferable credit and increments the course counter', async () => {
    const userId = await createTestUser();
    const poolBefore = await selectCreditPool(COURSE_INSTANCE_ID);

    const result = await redeemFreeAiGradingCredit({
      course_id: COURSE_ID,
      course_instance_id: COURSE_INSTANCE_ID,
      user_id: userId,
    });

    assert.equal(result.redemptions_used, 1);
    assert.equal(
      result.redemptions_remaining,
      MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE - 1,
    );
    assert.equal(result.amount_milli_dollars, FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION);

    const poolAfter = await selectCreditPool(COURSE_INSTANCE_ID);
    assert.equal(
      poolAfter.credit_non_transferable_milli_dollars,
      poolBefore.credit_non_transferable_milli_dollars +
        FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
    );
    assert.equal(
      poolAfter.credit_transferable_milli_dollars,
      poolBefore.credit_transferable_milli_dollars,
    );

    const used = await selectCourseFreeCreditRedemptionsUsed(COURSE_ID);
    assert.equal(used, 1);
  });

  it('enforces the lifetime cap per course', async () => {
    const userId = await createTestUser();

    for (let i = 0; i < MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE; i++) {
      await redeemFreeAiGradingCredit({
        course_id: COURSE_ID,
        course_instance_id: COURSE_INSTANCE_ID,
        user_id: userId,
      });
    }

    const used = await selectCourseFreeCreditRedemptionsUsed(COURSE_ID);
    assert.equal(used, MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE);

    await expect(
      redeemFreeAiGradingCredit({
        course_id: COURSE_ID,
        course_instance_id: COURSE_INSTANCE_ID,
        user_id: userId,
      }),
    ).rejects.toThrow(/free AI grading credit redemptions/);

    const usedAfter = await selectCourseFreeCreditRedemptionsUsed(COURSE_ID);
    assert.equal(usedAfter, MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE);
  });

  it('shares the cap across course instances of the same course', async () => {
    const userId = await createTestUser();
    const secondCourseInstanceId = await insertSecondCourseInstance();

    await redeemFreeAiGradingCredit({
      course_id: COURSE_ID,
      course_instance_id: COURSE_INSTANCE_ID,
      user_id: userId,
    });
    await redeemFreeAiGradingCredit({
      course_id: COURSE_ID,
      course_instance_id: COURSE_INSTANCE_ID,
      user_id: userId,
    });
    await redeemFreeAiGradingCredit({
      course_id: COURSE_ID,
      course_instance_id: secondCourseInstanceId,
      user_id: userId,
    });

    const used = await selectCourseFreeCreditRedemptionsUsed(COURSE_ID);
    assert.equal(used, MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE);

    const poolFirst = await selectCreditPool(COURSE_INSTANCE_ID);
    assert.equal(
      poolFirst.credit_non_transferable_milli_dollars,
      2 * FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
    );
    const poolSecond = await selectCreditPool(secondCourseInstanceId);
    assert.equal(
      poolSecond.credit_non_transferable_milli_dollars,
      FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION,
    );

    await expect(
      redeemFreeAiGradingCredit({
        course_id: COURSE_ID,
        course_instance_id: secondCourseInstanceId,
        user_id: userId,
      }),
    ).rejects.toThrow(/free AI grading credit redemptions/);
    await expect(
      redeemFreeAiGradingCredit({
        course_id: COURSE_ID,
        course_instance_id: COURSE_INSTANCE_ID,
        user_id: userId,
      }),
    ).rejects.toThrow(/free AI grading credit redemptions/);
  });
});
