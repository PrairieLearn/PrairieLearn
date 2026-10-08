import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import z from 'zod';

import { execute, loadSqlEquiv, queryRows, queryScalar } from '@prairielearn/postgres';

import pendingScoreBackfill from '../batched-migrations/20261008010001_assessment_instances__pending_score__backfill.js';
import { updateAssessmentInstancesScorePending } from '../lib/assessment-grading.js';
import { makeAssessmentInstance, setAssessmentInstanceScore } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  updateAssessmentQuestionRubric,
  updateInstanceQuestionScore,
  updateInstanceQuestionsManualGrading,
} from '../lib/manualGrading.js';
import {
  selectAssessmentInstanceById,
  selectAssessmentInstanceIdsForPendingScoreRefresh,
} from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { insertGradingJob, updateGradingJobAfterGrading } from '../models/grading-job.js';
import { selectUserByUid } from '../models/user.js';

import { syncCourse } from './helperCourse.js';
import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

async function createInstance(tid = 'hw4-perzonegrading') {
  const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid });
  const user = await selectUserByUid(config.authUid!);
  const id = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  return { id, assessment, user };
}

async function insertPendingExternalSubmission(assessmentInstanceId: string) {
  await execute(sql.insert_pending_auto_submissions, {
    assessment_instance_id: assessmentInstanceId,
    credits: JSON.stringify({ 'externalGrade/alpine': 100 }),
  });
  const [submission] = await queryRows(
    sql.select_pending_submission,
    { assessment_instance_id: assessmentInstanceId },
    z.object({ instance_question_id: z.string(), submission_id: z.string() }),
  );
  return submission;
}

describe('Pending assessment scores', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('best-of potential can select a different question and respects both score caps', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, user } = await createInstance();
      await execute(sql.set_manual_question_states, {
        assessment_instance_id: id,
        states: JSON.stringify([
          { qid: 'partialCredit4_v2', points: 0, max_points: 8 },
          { qid: 'partialCredit1', points: 25, max_points: 30 },
          { qid: 'partialCredit2', points: 20, max_points: 40 },
        ]),
      });
      await setAssessmentInstanceScore(id, (32 / 57) * 100, user.id);
      const pending = await selectAssessmentInstanceById(id);
      expect(pending.grading_pending).toBe(true);
      // The capped first zone contributes 7; the best potential second-zone question contributes 40.
      expect(pending.score_perc_pending).toBeCloseTo((15 / 57) * 100);

      const questionsBefore = await queryRows(
        sql.select_question_grade_state,
        { assessment_instance_id: id },
        z.object({ id: z.string(), used_for_grade: z.boolean().nullable() }),
      );
      const logsBefore = await queryScalar(
        sql.count_score_logs,
        { assessment_instance_id: id },
        z.number(),
      );
      await execute(sql.reset_pending_score, { assessment_instance_id: id });
      await pendingScoreBackfill.execute(BigInt(id), BigInt(id));
      const backfilled = await selectAssessmentInstanceById(id);
      expect(backfilled.points).toBe(pending.points);
      expect(backfilled.score_perc).toBe(pending.score_perc);
      expect(backfilled.grading_pending).toBe(true);
      expect(backfilled.score_perc_pending).toBeCloseTo((15 / 57) * 100);
      expect(
        await queryRows(
          sql.select_question_grade_state,
          { assessment_instance_id: id },
          z.object({ id: z.string(), used_for_grade: z.boolean().nullable() }),
        ),
      ).toEqual(questionsBefore);
      expect(
        await queryScalar(sql.count_score_logs, { assessment_instance_id: id }, z.number()),
      ).toBe(logsBefore);

      await setAssessmentInstanceScore(id, 100, user.id);
      const capped = await selectAssessmentInstanceById(id);
      expect(capped.grading_pending).toBe(true);
      expect(capped.score_perc_pending).toBe(0);
    });
  });

  test('automatic pending work uses its own credit instead of a newer submission on another question', async () => {
    await runInTransactionAndRollback(async () => {
      const { id } = await createInstance('hw9-internalExternalManual');
      await execute(sql.insert_pending_auto_submissions, {
        assessment_instance_id: id,
        credits: JSON.stringify({ 'internalGrade/addingNumbers': 80, 'externalGrade/alpine': 0 }),
      });
      await updateAssessmentInstancesScorePending([id]);
      const pending = await selectAssessmentInstanceById(id);
      expect(pending.grading_pending).toBe(true);
      expect(pending.score_perc).toBe(0);
      expect(pending.score_perc_pending).toBeCloseTo((4 / 32) * 100);
    });
  });

  test('manual review of automatic-only work and replacement rubric edits refresh potential without grading unanswered work', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, assessment, user } = await createInstance('hw9-internalExternalManual');
      const question = await queryRows(
        sql.select_question_ids,
        { assessment_instance_id: id },
        z.object({ id: z.string(), assessment_question_id: z.string(), qid: z.string() }),
      );
      const reviewed = question.find((q) => q.qid === 'internalGrade/addingNumbers')!;
      await execute(sql.set_automatic_question_score, { instance_question_id: reviewed.id });
      await updateInstanceQuestionsManualGrading({
        assessment_question_id: reviewed.assessment_question_id,
        instance_question_ids: null,
        requires_manual_grading: true,
        authn_user_id: user.id,
      });
      expect((await selectAssessmentInstanceById(id)).score_perc_pending).toBeCloseTo(
        (6 / 32) * 100,
      );

      await updateAssessmentQuestionRubric({
        assessment,
        assessment_question_id: reviewed.assessment_question_id,
        use_rubric: true,
        starting_points: 0,
        min_points: 0,
        max_extra_points: 2,
        replace_auto_points: true,
        rubric_items: [
          { points: 8, description: 'Full credit', order: 0, always_show_to_students: true },
        ],
        tag_for_manual_grading: false,
        grader_guidelines: null,
        authn_user_id: user.id,
      });
      expect((await selectAssessmentInstanceById(id)).score_perc_pending).toBeCloseTo(
        (8 / 32) * 100,
      );

      await updateInstanceQuestionsManualGrading({
        assessment_question_id: reviewed.assessment_question_id,
        instance_question_ids: null,
        requires_manual_grading: false,
        authn_user_id: user.id,
      });
      const cleared = await selectAssessmentInstanceById(id);
      expect(cleared.grading_pending).toBe(false);
      expect(cleared.score_perc_pending).toBe(0);

      const unanswered = question.find((q) => q.qid === 'manualGrade/codeUpload')!;
      await updateInstanceQuestionsManualGrading({
        assessment_question_id: unanswered.assessment_question_id,
        instance_question_ids: null,
        requires_manual_grading: true,
        authn_user_id: user.id,
      });
      expect((await selectAssessmentInstanceById(id)).grading_pending).toBe(false);
    });
  });

  test('manual-only grading retains unresolved automatic work and explicit automatic overrides supersede its job', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, assessment, user } = await createInstance('hw9-internalExternalManual');
      const { instance_question_id, submission_id } = await insertPendingExternalSubmission(id);
      await execute(sql.add_manual_points, { instance_question_id });
      await updateInstanceQuestionScore({
        assessment,
        instance_question_id,
        submission_id,
        check_modified_at: null,
        score: { manual_points: 2 },
        authn_user_id: user.id,
      });
      const saved = await selectAssessmentInstanceById(id);
      expect(saved.grading_pending).toBe(true);
      expect(saved.score_perc_pending).toBeCloseTo((2 / 32) * 100);

      const job = await insertGradingJob({ submission_id, authn_user_id: user.id });
      await updateInstanceQuestionScore({
        assessment,
        instance_question_id,
        submission_id,
        check_modified_at: null,
        score: { auto_points: 3 },
        authn_user_id: user.id,
      });
      const overridden = await selectAssessmentInstanceById(id);
      expect(overridden.grading_pending).toBe(false);
      expect(overridden.points).toBe(5);
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 1,
      });
      expect((await selectAssessmentInstanceById(id)).points).toBe(5);
    });
  });

  test('a total question override supersedes unresolved automatic grading', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, assessment, user } = await createInstance('hw9-internalExternalManual');
      const submission = await insertPendingExternalSubmission(id);
      await insertGradingJob({
        submission_id: submission.submission_id,
        authn_user_id: user.id,
      });
      await updateInstanceQuestionScore({
        assessment,
        ...submission,
        check_modified_at: null,
        score: { points: 1 },
        authn_user_id: user.id,
      });
      const overridden = await selectAssessmentInstanceById(id);
      expect(overridden.points).toBe(1);
      expect(overridden.grading_pending).toBe(false);
    });
  });

  test('automatic grading can complete after the manual portion has been graded', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, assessment, user } = await createInstance('hw9-internalExternalManual');
      await insertPendingExternalSubmission(id);
      const submission = await insertPendingExternalSubmission(id);
      await execute(sql.add_manual_points, {
        instance_question_id: submission.instance_question_id,
      });
      const job = await insertGradingJob({
        submission_id: submission.submission_id,
        authn_user_id: user.id,
      });
      await updateInstanceQuestionScore({
        assessment,
        ...submission,
        check_modified_at: null,
        score: { manual_points: 2 },
        authn_user_id: user.id,
      });
      expect((await selectAssessmentInstanceById(id)).grading_pending).toBe(true);
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 1,
      });
      const graded = await selectAssessmentInstanceById(id);
      expect(graded.points).toBe(4);
      expect(graded.grading_pending).toBe(false);
      expect(
        await selectAssessmentInstanceIdsForPendingScoreRefresh({ start_id: id, end_id: id }),
      ).toEqual([]);
    });
  });

  test('course sync refreshes closed homework after grading-policy changes', async () => {
    await runInTransactionAndRollback(async () => {
      const { id } = await createInstance('hw9-internalExternalManual');
      await execute(sql.set_manual_question_states, {
        assessment_instance_id: id,
        states: JSON.stringify([
          { qid: 'internalGrade/addingNumbers2', points: 0, max_points: 10 },
        ]),
      });
      await execute(sql.close_instance, { assessment_instance_id: id });
      await updateAssessmentInstancesScorePending([id]);
      expect((await selectAssessmentInstanceById(id)).score_perc_pending).toBeCloseTo(
        (10 / 32) * 100,
      );
      await syncCourse();
      const synced = await selectAssessmentInstanceById(id);
      expect(synced.score_perc_pending).toBeCloseTo((2 / 32) * 100);
      expect(synced.grading_pending).toBe(true);
      expect(synced.open).toBe(false);
      expect(synced.points).toBe(0);
      expect(synced.score_perc).toBe(0);

      const questions = await queryRows(
        sql.select_question_ids,
        { assessment_instance_id: id },
        z.object({ id: z.string(), assessment_question_id: z.string(), qid: z.string() }),
      );
      const pendingQuestion = questions.find(
        (question) => question.qid === 'internalGrade/addingNumbers2',
      )!;
      await execute(sql.hide_question, {
        assessment_question_id: pendingQuestion.assessment_question_id,
      });
      await updateAssessmentInstancesScorePending([id]);
      expect((await selectAssessmentInstanceById(id)).grading_pending).toBe(false);
      await syncCourse();
      expect((await selectAssessmentInstanceById(id)).grading_pending).toBe(true);
      expect((await selectAssessmentInstanceById(id)).score_perc_pending).toBeCloseTo(
        (2 / 32) * 100,
      );
    });
  });

  test('a replacement rubric resolves total points and outstanding automatic grading', async () => {
    await runInTransactionAndRollback(async () => {
      const { id, assessment, user } = await createInstance('hw9-internalExternalManual');
      const submission = await insertPendingExternalSubmission(id);
      await execute(sql.add_manual_points, {
        instance_question_id: submission.instance_question_id,
      });
      const [question] = await queryRows(
        sql.select_question_ids,
        { assessment_instance_id: id },
        z.object({ id: z.string(), assessment_question_id: z.string(), qid: z.string() }),
      ).then((rows) => rows.filter((row) => row.id === submission.instance_question_id));
      await insertGradingJob({
        submission_id: submission.submission_id,
        authn_user_id: user.id,
      });
      await updateAssessmentQuestionRubric({
        assessment,
        assessment_question_id: question.assessment_question_id,
        use_rubric: true,
        starting_points: 0,
        min_points: 0,
        max_extra_points: 2,
        replace_auto_points: true,
        rubric_items: [
          { points: 10, description: 'Full credit', order: 0, always_show_to_students: true },
        ],
        tag_for_manual_grading: false,
        grader_guidelines: null,
        authn_user_id: user.id,
      });
      expect((await selectAssessmentInstanceById(id)).score_perc_pending).toBeCloseTo(
        (10 / 32) * 100,
      );
      const [rubric] = await queryRows(
        sql.select_rubric_item,
        { assessment_question_id: question.assessment_question_id },
        z.object({ rubric_id: z.string(), rubric_item_id: z.string() }),
      );
      await updateInstanceQuestionScore({
        assessment,
        ...submission,
        check_modified_at: null,
        score: {
          manual_rubric_data: {
            rubric_id: rubric.rubric_id,
            applied_rubric_items: [{ rubric_item_id: rubric.rubric_item_id, score: 1 }],
            adjust_points: 0,
          },
        },
        authn_user_id: user.id,
      });
      const graded = await selectAssessmentInstanceById(id);
      expect(graded.points).toBe(10);
      expect(graded.grading_pending).toBe(false);
    });
  });
});
