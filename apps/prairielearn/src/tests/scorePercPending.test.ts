import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { updateAssessmentInstanceScore } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, SprocAssessmentInstancesGradeSchema } from '../lib/db-types.js';
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
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );
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
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );
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
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.equal(refreshed.score_perc_pending, 0);
  });

  it('zone maxPoints caps score_perc_pending', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingZoneCap');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    const maxPoints = refreshed.max_points ?? 0;
    const expected = maxPoints <= 0 ? 0 : (40 / maxPoints) * 100;
    assert.closeTo(refreshed.score_perc_pending, expected, 0.0001);
  });

  it('bestQuestions counts only used-for-grade pending manual points', async () => {
    const assessment_id = await startAssessment('hwScorePercPendingBestQuestions');
    const assessmentInstance = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    await sqldb.execute(sql.mark_instance_questions_requires_manual_grading, {
      assessment_instance_id: assessmentInstance.id,
    });
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );
    const refreshed = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    const maxPoints = refreshed.max_points ?? 0;
    const expected = maxPoints <= 0 ? 0 : (10 / maxPoints) * 100;
    assert.closeTo(refreshed.score_perc_pending, expected, 0.0001);
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
    await sqldb.callRow(
      'assessment_instances_grade',
      [
        assessmentInstance.id,
        '1', // authn_user_id
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ],
      SprocAssessmentInstancesGradeSchema,
    );

    const pending = await sqldb.queryRow(
      sql.select_latest_assessment_instance,
      { assessment_id },
      AssessmentInstanceSchema,
    );
    assert.closeTo(pending.score_perc_pending, 100, 0.0001);

    await updateAssessmentInstanceScore(pending.id, 42, '1');

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
