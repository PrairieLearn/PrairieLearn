import { rejects } from 'node:assert/strict';

import { afterAll, assert, beforeAll, describe, it, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';

import backfill from '../batched-migrations/20261116133500_shared_question_usages__backfill.js';
import { SharedQuestionUsageSchema, VariantSchema } from '../lib/db-types.js';
import { saveSubmission } from '../lib/grading.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionById } from '../models/question.js';
import * as sharedQuestionUsages from '../models/shared-question-usages.js';
import * as questionServers from '../question-servers/index.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

async function submit(variant_id: string) {
  const variant = await queryRow(sql.select_variant, { variant_id }, VariantSchema);
  return await saveSubmission(
    {
      variant_id,
      user_id: variant.user_id ?? '1',
      auth_user_id: '3',
      submitted_answer: { answer: '1' },
    },
    variant,
    await selectQuestionById(variant.question_id),
    await selectCourseById(variant.course_id),
  );
}

async function selectUsages() {
  return await queryRows(sql.select_usages, SharedQuestionUsageSchema);
}

describe('Shared question usage recording', () => {
  beforeAll(async () => {
    await helperDb.before();
    await execute(sql.insert_fixture);
    const module = questionServers.getModule('Freeform');
    vi.spyOn(questionServers, 'getModule').mockReturnValue({
      ...module,
      parse: async (submission, variant) => ({
        courseIssues: [],
        data: {
          params: variant.params ?? {},
          true_answer: variant.true_answer ?? {},
          submitted_answer: submission.submitted_answer ?? {},
          raw_submitted_answer: submission.raw_submitted_answer ?? {},
          feedback: {},
          format_errors: {},
          gradable: true,
        },
      }),
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await helperDb.after();
  });

  it('counts eligible students once and retains their usage after deletion', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      assert.deepEqual(await sharedQuestionUsages.selectSharedQuestionUsageCounts(['1']), [
        { question_id: '1', student_count: 0 },
      ]);
      // Retries, sibling copies, another assessment, a group, then excluded activity.
      for (const variant_id of ['1', '1', '2', '3', '7', '4', '5', '6', '8']) {
        await submit(variant_id);
      }
      assert.deepEqual(
        (await selectUsages()).map((u) => [
          u.destination_user_id,
          u.destination_course_id,
          u.destination_course_instance_id,
          u.destination_assessment_id,
        ]),
        [
          ['1', '2', '1', '1'],
          ['1', '2', '1', '2'],
          ['2', '2', '1', '1'],
        ],
      );
      assert.deepEqual(await sharedQuestionUsages.selectSharedQuestionUsageCounts(['1']), [
        { question_id: '1', student_count: 2 },
      ]);
      await execute(sql.delete_history);
      assert.equal(await queryScalar(sql.count_submissions, z.number()), 0);
      assert.deepEqual(await sharedQuestionUsages.selectSharedQuestionUsageCounts(['1']), [
        { question_id: '1', student_count: 2 },
      ]);
    });
  });

  it('rolls back the submission when usage recording fails', async () => {
    const recordUsage = sharedQuestionUsages.insertSharedQuestionUsagesForSubmission;
    const spy = vi
      .spyOn(sharedQuestionUsages, 'insertSharedQuestionUsagesForSubmission')
      .mockImplementationOnce(async (submission_id) => {
        await recordUsage(submission_id);
        throw new Error('Usage recording failed');
      });
    try {
      await rejects(submit('1'), /Usage recording failed/);
    } finally {
      spy.mockRestore();
    }
    assert.deepEqual(await selectUsages(), []);
    assert.equal(await queryScalar(sql.count_submissions, z.number()), 0);
  });

  it('backfills only submitted activity within each batch and can safely retry', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      for (const variant_id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
        await execute(sql.insert_saved_submission, { variant_id });
      }
      await backfill.execute(1n, 1n);
      assert.deepEqual(await sharedQuestionUsages.selectSharedQuestionUsageCounts(['1']), [
        { question_id: '1', student_count: 1 },
      ]);
      await backfill.execute(2n, 9n);
      assert.deepEqual(await sharedQuestionUsages.selectSharedQuestionUsageCounts(['1']), [
        { question_id: '1', student_count: 2 },
      ]);
      const usages = await selectUsages();
      assert.lengthOf(usages, 3);
      assert.equal(usages[0].destination_course_instance_id, '1');
      await backfill.execute(1n, 9n);
      assert.deepEqual(await selectUsages(), usages);
    });
  });
});
