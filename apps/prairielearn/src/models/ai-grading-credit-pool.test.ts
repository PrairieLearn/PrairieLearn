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
  setCreditPoolBalance,
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
  if (transferable !== 0) {
    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: transferable,
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
    setupChangeCount = 0;
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

  it('drives transferable negative when cost exceeds total (mixed pool)', async () => {
    await seed(1000, 2000); // total = 3000

    const deducted = await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 5000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    assert.equal(deducted, 5000);

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -2000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.total_milli_dollars, -2000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 2);
    assert.equal(changes[0].credit_type, 'non_transferable');
    assert.equal(changes[0].delta_milli_dollars, -2000);
    assert.equal(changes[0].credit_before_milli_dollars, 3000);
    assert.equal(changes[0].credit_after_milli_dollars, 1000);
    assert.equal(changes[1].credit_type, 'transferable');
    assert.equal(changes[1].delta_milli_dollars, -3000);
    assert.equal(changes[1].credit_before_milli_dollars, 1000);
    assert.equal(changes[1].credit_after_milli_dollars, -2000);
  });

  it('drives transferable negative when starting from $0', async () => {
    // No seed — pool starts at $0
    const deducted = await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 1000,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    assert.equal(deducted, 1000);

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -1000);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.total_milli_dollars, -1000);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'transferable');
    assert.equal(changes[0].delta_milli_dollars, -1000);
    assert.equal(changes[0].credit_before_milli_dollars, 0);
    assert.equal(changes[0].credit_after_milli_dollars, -1000);
  });

  it('drives transferable further negative on subsequent deduction', async () => {
    await seed(-500, 0);

    const deducted = await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 300,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    assert.equal(deducted, 300);

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -800);
    assert.equal(pool.total_milli_dollars, -800);

    const changes = deductionChanges(await selectAllChanges(ciId));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'transferable');
    assert.equal(changes[0].delta_milli_dollars, -300);
    assert.equal(changes[0].credit_before_milli_dollars, -500);
    assert.equal(changes[0].credit_after_milli_dollars, -800);
  });

  it('does not drive non-transferable negative when only non-transferable is available', async () => {
    await seed(0, 1000);

    await deductCreditsForAiGrading({
      course_instance_id: ciId,
      cost_milli_dollars: 2500,
      user_id: null,
      ai_grading_job_id: null,
      assessment_question_id: null,
      reason: 'AI grading',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.credit_transferable_milli_dollars, -1500);
    assert.equal(pool.total_milli_dollars, -1500);
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

  it('caps deduction to the transferable balance when deducting more', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 2000, 5000);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: -3000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin deduction',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 0);
    assert.equal(pool.credit_non_transferable_milli_dollars, 5000);
  });

  it('caps deduction to the non-transferable balance when deducting more', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 5000, 2000);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: -3000,
      credit_type: 'non_transferable',
      user_id: userId,
      reason: 'Admin deduction',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 0);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);
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

  it('adds the full amount when transferable balance is negative', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, -500, 0);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 200,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin grant',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -300);

    const changes = (await selectAllChanges(ciId)).filter(
      (change) => change.reason === 'Admin grant',
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].delta_milli_dollars, 200);
    assert.equal(changes[0].credit_before_milli_dollars, -500);
    assert.equal(changes[0].credit_after_milli_dollars, -300);
  });

  it('refuses to deduct when transferable balance is already negative', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, -500, 0);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: -100,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin deduct',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -500);

    const changes = (await selectAllChanges(ciId)).filter(
      (change) => change.reason === 'Admin deduct',
    );
    assert.equal(changes.length, 0);
  });

  it('refuses to deduct when balance is exactly zero', async () => {
    const userId = await createTestUser();
    await seedCreditBalances(ciId, userId, 0, 0);

    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: -100,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin deduct',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 0);

    const changes = await selectAllChanges(ciId);
    assert.equal(changes.length, 0);
  });
});

describe('setCreditPoolBalance', () => {
  const ciId = '1';

  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async () => {
    await helperDb.after();
  });

  it('sets a positive transferable balance from zero', async () => {
    const userId = await createTestUser();

    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: 5000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin set balance',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, 5000);

    const changes = await selectAllChanges(ciId);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].credit_type, 'transferable');
    assert.equal(changes[0].delta_milli_dollars, 5000);
    assert.equal(changes[0].credit_before_milli_dollars, 0);
    assert.equal(changes[0].credit_after_milli_dollars, 5000);
  });

  it('sets a negative transferable balance', async () => {
    const userId = await createTestUser();

    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: -2500,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin set balance',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -2500);
    assert.equal(pool.total_milli_dollars, -2500);

    const changes = await selectAllChanges(ciId);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].delta_milli_dollars, -2500);
    assert.equal(changes[0].credit_before_milli_dollars, 0);
    assert.equal(changes[0].credit_after_milli_dollars, -2500);
  });

  it('sets transferable balance from positive to negative', async () => {
    const userId = await createTestUser();
    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 3000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'test setup',
    });

    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: -1000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin set balance',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_transferable_milli_dollars, -1000);

    const changes = await selectAllChanges(ciId);
    const setChange = changes[changes.length - 1];
    assert.equal(setChange.delta_milli_dollars, -4000);
    assert.equal(setChange.credit_before_milli_dollars, 3000);
    assert.equal(setChange.credit_after_milli_dollars, -1000);
  });

  it('is a no-op when target equals current balance', async () => {
    const userId = await createTestUser();
    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 2000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'test setup',
    });
    const beforeChangeCount = (await selectAllChanges(ciId)).length;

    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: 2000,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin set balance',
    });

    const afterChangeCount = (await selectAllChanges(ciId)).length;
    assert.equal(afterChangeCount, beforeChangeCount);
  });

  it('refuses to set non-transferable balance below zero', async () => {
    const userId = await createTestUser();

    await expect(
      setCreditPoolBalance({
        course_instance_id: ciId,
        target_milli_dollars: -100,
        credit_type: 'non_transferable',
        user_id: userId,
        reason: 'Admin set balance',
      }),
    ).rejects.toThrowError(/Non-transferable credit balance cannot be set below 0/);
  });

  it('leaves non-selected credit type unchanged', async () => {
    const userId = await createTestUser();
    await adjustCreditPool({
      course_instance_id: ciId,
      delta_milli_dollars: 4000,
      credit_type: 'non_transferable',
      user_id: userId,
      reason: 'test setup',
    });

    await setCreditPoolBalance({
      course_instance_id: ciId,
      target_milli_dollars: -500,
      credit_type: 'transferable',
      user_id: userId,
      reason: 'Admin set balance',
    });

    const pool = await selectCreditPool(ciId);
    assert.equal(pool.credit_non_transferable_milli_dollars, 4000);
    assert.equal(pool.credit_transferable_milli_dollars, -500);
    assert.equal(pool.total_milli_dollars, 3500);
  });
});
