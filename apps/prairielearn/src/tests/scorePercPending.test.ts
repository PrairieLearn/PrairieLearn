import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

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
});
