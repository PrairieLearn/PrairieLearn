import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { queryRows } from '@prairielearn/postgres';

import { AiGradingCreditPoolChangeSchema } from '../lib/db-types.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  adjustCreditPool,
  deductCreditsForAiGrading,
  selectCreditPool,
} from './ai-grading-credit-pool.js';

async function selectAllChanges(course_instance_id: string) {
  return await queryRows(
    `SELECT * FROM ai_grading_credit_pool_changes
     WHERE course_instance_id = $course_instance_id
     ORDER BY id ASC`,
    { course_instance_id },
    AiGradingCreditPoolChangeSchema,
  );
}

async function createTestUser(): Promise<string> {
  const user = await getOrCreateUser({
    uid: 'admin@example.com',
    name: 'Test Admin',
    uin: 'admin1',
    email: 'admin@example.com',
  });
  return user.id;
}

async function seedCreditBalances(
  ciId: string,
  userId: string,
  transferable: number,
  nonTransferable: number,
) {
  if (transferable > 0) {
    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: transferable,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'test setup',
    });
  }
  if (nonTransferable > 0) {
    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: nonTransferable,
      credit_type: 'non_transferable',
      user_id: userId,
      reason: 'test setup',
    });
  }
}

describe('deductCreditsForAiGrading', () => {
  const ciId = '1';
  let userId: string;
  let setupChangeCount: number;

  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    userId = await createTestUser();
  });

  afterEach(async () => {
    await helperDb.after();
  });

  async function seed(transferable: number, nonTransferable: number) {
    await seedCreditBalances(ciId, userId, transferable, nonTransferable);
    setupChangeCount = (await selectAllChanges(ciId)).length;
  }

  function deductionChanges(allChanges: Awaited<ReturnType<typeof selectAllChanges>>) {
    return allChanges.slice(setupChangeCount);
  }

  it('deducts from non-transferable credits first', async () => {
    await seed(5000, 3000);

    await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 2000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 1000);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);
    assert.equal(pool.total_milli_dollars, 6000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'non_transferable');
    assert.equal(changes[0].delta_milli_dollars, -2000);
  });

  it('deducts from both pools when cost exceeds non-transferable balance', async () => {
    await seed(5000, 3000);

    await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 4000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.credit_transferable_milli_dollars, 4000);
    assert.equal(pool.total_milli_dollars, 4000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 2);

    assert.equal(changes[0].credit_type, 'non_transferable');
    assert.equal(changes[0].delta_milli_dollars, -3000);
    assert.equal(changes[0].credit_before_milli_dollars, 8000);
    assert.equal(changes[0].credit_after_milli_dollars, 5000);

    assert.equal(changes[1].credit_type, 'transferable');
    assert.equal(changes[1].delta_milli_dollars, -1000);
    assert.equal(changes[1].credit_before_milli_dollars, 5000);
    assert.equal(changes[1].credit_after_milli_dollars, 4000);
  });

  it('deducts entirely from transferable when non-transferable is zero', async () => {
    await seed(5000, 0);

    await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 2000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.credit_transferable_milli_dollars, 3000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'transferable');
    assert.equal(changes[0].delta_milli_dollars, -2000);
  });

  it('deducts exactly non-transferable balance without touching transferable', async () => {
    await seed(5000, 3000);

    await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 3000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'non_transferable');
    assert.equal(changes[0].delta_milli_dollars, -3000);
  });

  it('throws when total balance is insufficient', async () => {
    await seed(1000, 2000);

    await expect(
      deductCreditsForAiGrading({
        course_instance_id: ciId,
        cost_milli_dollars: 5000,
        user_id: null,
        ai_grading_job_id: null,
        assessment_question_id: null,
        reason: 'AI grading',
      }),
    ).rejects.toThrow('Insufficient AI grading credits');

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 1000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 2000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 0);
  });
});

describe('adjustCreditPool', () => {
  const ciId = '1';

  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async () => {
    await helperDb.after();
  });

  it('adds transferable credits', async () => {
    const userId = await createTestUser();

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 5000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin grant',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);

    const changes = await selectAllChanges(ciId);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'transferable');
    assert.equal(changes[0].delta_milli_dollars, 5000);
    assert.equal(changes[0].credit_before_milli_dollars, 0);
    assert.equal(changes[0].credit_after_milli_dollars, 5000);
  });

  it('adds non-transferable credits', async () => {
    const userId = await createTestUser();

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 3000,
      credit_type: 'non_transferable',
      user_id: userId,
      reason: 'Admin grant',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 0);
    assert.equal(pool.credit_non_transferable_milli_dollars, 3000);

    const changes = await selectAllChanges(ciId);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'non_transferable');
    assert.equal(changes[0].delta_milli_dollars, 3000);
    assert.equal(changes[0].credit_before_milli_dollars, 0);
    assert.equal(changes[0].credit_after_milli_dollars, 3000);
  });

  it('throws when deducting more than the transferable balance', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 2000, 5000);

    await expect(
      adjustCreditPool({
        course_instance_id: ciId,
        delta_milli_dollars: -3000,
        credit_type: 'transferable',
        user_id: userId,
        reason: 'Admin deduction',
      }),
    ).rejects.toThrow(/Cannot deduct more than the current transferable balance/);

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 2000);
  });

  it('throws when deducting more than the non-transferable balance', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 5000, 2000);

    await expect(
      adjustCreditPool({
        course_instance_id: ciId,
        delta_milli_dollars: -3000,
        credit_type: 'non_transferable',
        user_id: userId,
        reason: 'Admin deduction',
      }),
    ).rejects.toThrow(/Cannot deduct more than the current non-transferable balance/);

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 2000);
  });

  it('does nothing when delta is zero', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 5000, 3000);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 0,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'No-op',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 3000);

    const changes = await selectAllChanges(ciId);
    // Only the seed changes, no additional change from the zero-delta call
    assert.equal(changes.length, 2);
  });

  it('only modifies the specified credit type', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 4000, 6000);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 2000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Add transferable',
    });

    let pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 6000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 6000);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 1000,
      credit_type: 'non_transferable',
      user_id: userId,
      reason: 'Add non-transferable',
    });

    pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 6000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 7000);
  });
});
