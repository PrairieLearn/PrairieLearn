import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  updateAssessmentInstanceGrade,
  updateAssessmentInstancesScorePercPending,
} from '../lib/assessment-grading.js';
import { setAssessmentInstancePoints } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, InstanceQuestionSchema } from '../lib/db-types.js';
import { updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;

async function startAssessment(tid: string): Promise<string> {
  const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid });
  const assessmentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessment.id}/`;
  const res = await fetch(assessmentUrl);
  assert.equal(res.status, 200);
  return assessment.id;
}

describe('score_perc_pending', { timeout: 40_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('manual-only assessment has score_perc_pending = 100', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingManualOnly');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateAssessmentInstanceGrade({
      assessment_instance_id: assessmentInstance.id,
      authn_user_id: '1',
      credit: 100,
      allowDecrease: true,
    });
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.closeTo(refreshed.score_perc_pending, 100, 0.0001);
  });

  it('mixed assessment counts only ungraded manual points as pending', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingMixed');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    // Manual questions have max_manual_points = max_points, and auto questions have max_manual_points = 0.
    // Mark only the 50-point manual question as pending.
    await sqldb.execute(sql.set_manual_requires_manual_grading_by_max_manual_points, {
      assessment_instance_id: assessmentInstance.id,
      pending_max_manual_points: 50,
    });
    await updateAssessmentInstanceGrade({
      assessment_instance_id: assessmentInstance.id,
      authn_user_id: '1',
      credit: 100,
      allowDecrease: true,
    });
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.isNotNull(refreshed.max_points);
    assert.closeTo(refreshed.score_perc_pending, 50, 0.0001);
  });

  it('zero-max assessment has score_perc_pending = 0', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingZeroMax');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await updateAssessmentInstanceGrade({
      assessment_instance_id: assessmentInstance.id,
      authn_user_id: '1',
      credit: 100,
      allowDecrease: true,
    });
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(refreshed.score_perc_pending, 0);
  });

  it('manual override clears score_perc_pending', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingManualOnly');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateAssessmentInstanceGrade({
      assessment_instance_id: assessmentInstance.id,
      authn_user_id: '1',
      credit: 100,
      allowDecrease: true,
    });

    const pending = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.closeTo(pending.score_perc_pending, 100, 0.0001);

    await setAssessmentInstancePoints(pending.id, 42, '1');

    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(refreshed.score_perc_pending, 0);

    const pendingQuestions = await sqldb.queryRow(
      sql.count_pending_instance_questions,
      { assessment_instance_id: assessmentInstance.id },
      z.number(),
    );
    assert.equal(pendingQuestions, 0);
  });

  it('updates score_perc_pending without recomputing score', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingManualOnly');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateAssessmentInstanceGrade({
      assessment_instance_id: assessmentInstance.id,
      authn_user_id: '1',
      credit: 100,
      allowDecrease: true,
    });

    const before = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.closeTo(before.score_perc_pending, 100, 0.0001);
    const pointsBefore = before.points;
    const scoreBefore = before.score_perc;

    await sqldb.execute(sql.clear_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const after = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(after.score_perc_pending, 0);
    assert.equal(after.points, pointsBefore);
    assert.equal(after.score_perc, scoreBefore);
  });

  it('manual points do not clear pending while requires_manual_grading is true', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingManualOnly');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );

    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await sqldb.execute(sql.set_manual_points_for_assessment_instance, {
      assessment_instance_id: assessmentInstance.id,
      manual_points: 3,
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.closeTo(refreshed.score_perc_pending, 100, 0.0001);
  });

  it('saved autograded submissions contribute pending until grading completes', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingMixed');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    const autogradedInstanceQuestion = await sqldb.queryRow(
      sql.select_autograded_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      InstanceQuestionSchema,
    );

    await sqldb.execute(sql.clear_manual_requires_manual_grading_for_assessment_instance, {
      assessment_instance_id: assessmentInstance.id,
    });
    await sqldb.execute(sql.update_instance_question_status, {
      instance_question_id: autogradedInstanceQuestion.id,
      status: 'saved',
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const pending = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.isAbove(pending.score_perc_pending, 0);

    await sqldb.execute(sql.update_instance_question_status, {
      instance_question_id: autogradedInstanceQuestion.id,
      status: 'complete',
    });
    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);

    const finalized = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(finalized.score_perc_pending, 0);
  });

  it('regrading with the same score clears manual pending', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hwScorePercPendingManualOnly',
    });
    const assessment_id = await startAssessment('hwScorePercPendingManualOnly');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    const instanceQuestion = await sqldb.queryRow(
      sql.select_instance_question,
      { assessment_instance_id: assessmentInstance.id },
      InstanceQuestionSchema,
    );

    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: instanceQuestion.id,
      submission_id: null,
      check_modified_at: null,
      score: { manual_points: 3 },
      authn_user_id: '1',
    });

    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: instanceQuestion.id,
      submission_id: null,
      check_modified_at: null,
      score: { manual_points: 3 },
      authn_user_id: '1',
    });

    await updateAssessmentInstancesScorePercPending([assessmentInstance.id]);
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(refreshed.score_perc_pending, 0);

    const pendingQuestions = await sqldb.queryRow(
      sql.count_pending_instance_questions,
      { assessment_instance_id: assessmentInstance.id },
      z.number(),
    );
    assert.equal(pendingQuestions, 0);
  });
});
