import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { updateAssessmentInstancesScorePercPending } from '../lib/assessment-grading.js';
import { setAssessmentInstancePoints } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, InstanceQuestionSchema } from '../lib/db-types.js';
import { updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const PendingQuestionCountRowSchema = z.object({ count: z.number() });
const AssessmentQuestionPointsSchema = z.object({
  id: z.string(),
  max_manual_points: z.number(),
  max_auto_points: z.number(),
});

const siteUrl = 'http://localhost:' + config.serverPort;

async function startAssessment(tid: string): Promise<string> {
  const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid });
  const assessmentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessment.id}/`;
  const res = await helperClient.fetchCheerio(assessmentUrl);
  assert.equal(res.status, 200);

  if (!res.url.includes('/assessment_instance/')) {
    const startRes = await helperClient.fetchCheerio(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'new_instance',
        __csrf_token: helperClient.getCSRFToken(res.$('form')),
      }),
    });
    assert.equal(startRes.status, 200);
    assert.include(startRes.url, '/assessment_instance/');
  }

  return assessment.id;
}

async function getLatestAssessmentInstance(assessment_id: string) {
  return await sqldb.queryRow(
    sql.select_latest_assessment_instance,
    { assessment_id },
    AssessmentInstanceSchema,
  );
}

describe('score_perc_pending', { timeout: 40_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('pending-only recompute updates manual-only pending without changing earned score', async () => {
    const assessment_id = await startAssessment('hw9-internalExternalManual');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const manualOnlyQuestion = await sqldb.queryRow(
      sql.select_manual_only_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      AssessmentQuestionPointsSchema,
    );

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: manualOnlyQuestion.id,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const refreshed = await getLatestAssessmentInstance(assessment_id);
    assert.equal(refreshed.points, assessmentInstance.points);
    assert.equal(refreshed.score_perc, assessmentInstance.score_perc);
    assert.isNotNull(refreshed.max_points);
    assert.closeTo(
      refreshed.score_perc_pending,
      (manualOnlyQuestion.max_manual_points * 100) / refreshed.max_points,
      0.0001,
    );
  });

  it('mixed manual/auto questions only count the manual share when only manual grading is pending', async () => {
    const assessment_id = await startAssessment('exam17-mixedRealTimeGrading');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const mixedQuestion = await sqldb.queryRow(
      sql.select_mixed_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      AssessmentQuestionPointsSchema,
    );

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: mixedQuestion.id,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const refreshed = await getLatestAssessmentInstance(assessment_id);
    assert.isNotNull(refreshed.max_points);
    assert.closeTo(
      refreshed.score_perc_pending,
      (mixedQuestion.max_manual_points * 100) / refreshed.max_points,
      0.0001,
    );
  });

  it('assessment instances with max_points 0 report score_perc_pending = 0', async () => {
    const assessment_id = await startAssessment('hw9-internalExternalManual');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const manualOnlyQuestion = await sqldb.queryRow(
      sql.select_manual_only_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      AssessmentQuestionPointsSchema,
    );

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: manualOnlyQuestion.id,
    });
    await sqldb.execute(sql.set_assessment_instance_max_points, {
      assessment_instance_id: assessmentInstance.id,
      max_points: 0,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const refreshed = await getLatestAssessmentInstance(assessment_id);
    assert.equal(refreshed.max_points, 0);
    assert.equal(refreshed.score_perc_pending, 0);
  });

  it('manual override clears score_perc_pending', async () => {
    const assessment_id = await startAssessment('hw9-internalExternalManual');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const manualOnlyQuestion = await sqldb.queryRow(
      sql.select_manual_only_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      AssessmentQuestionPointsSchema,
    );

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: manualOnlyQuestion.id,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const pending = await getLatestAssessmentInstance(assessment_id);
    assert.isAbove(pending.score_perc_pending, 0);

    await setAssessmentInstancePoints(pending.id, 42, '1');

    const refreshed = await getLatestAssessmentInstance(assessment_id);
    assert.equal(refreshed.score_perc_pending, 0);

    const { count: pendingQuestions } = await sqldb.queryRow(
      sql.count_pending_instance_questions,
      { assessment_instance_id: assessmentInstance.id },
      PendingQuestionCountRowSchema,
    );
    assert.equal(pendingQuestions, 0);
  });

  it('saved autograded submissions contribute pending until grading completes', async () => {
    const assessment_id = await startAssessment('hw9-internalExternalManual');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const autogradedInstanceQuestion = await sqldb.queryRow(
      sql.select_autograded_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      InstanceQuestionSchema,
    );

    await sqldb.execute(sql.update_instance_question_status, {
      instance_question_id: autogradedInstanceQuestion.id,
      status: 'saved',
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const pending = await getLatestAssessmentInstance(assessment_id);
    assert.isAbove(pending.score_perc_pending, 0);

    await sqldb.execute(sql.update_instance_question_status, {
      instance_question_id: autogradedInstanceQuestion.id,
      status: 'complete',
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const finalized = await getLatestAssessmentInstance(assessment_id);
    assert.equal(finalized.score_perc_pending, 0);
  });

  it('regrading with the same score clears manual pending', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    const assessment_id = await startAssessment('hw9-internalExternalManual');
    const assessmentInstance = await getLatestAssessmentInstance(assessment_id);
    const manualOnlyQuestion = await sqldb.queryRow(
      sql.select_manual_only_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      AssessmentQuestionPointsSchema,
    );

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: manualOnlyQuestion.id,
    });
    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: manualOnlyQuestion.id,
      submission_id: null,
      check_modified_at: null,
      score: { manual_points: 3 },
      authn_user_id: '1',
    });

    await sqldb.execute(sql.mark_single_instance_question_requires_manual_grading, {
      instance_question_id: manualOnlyQuestion.id,
    });
    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: manualOnlyQuestion.id,
      submission_id: null,
      check_modified_at: null,
      score: { manual_points: 3 },
      authn_user_id: '1',
    });

    const refreshed = await getLatestAssessmentInstance(assessment_id);
    assert.equal(refreshed.score_perc_pending, 0);

    const { count: pendingQuestions } = await sqldb.queryRow(
      sql.count_pending_instance_questions,
      { assessment_instance_id: assessmentInstance.id },
      PendingQuestionCountRowSchema,
    );
    assert.equal(pendingQuestions, 0);
  });
});
