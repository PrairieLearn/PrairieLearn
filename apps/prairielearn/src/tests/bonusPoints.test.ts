import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Exam assessment with bonus points', { timeout: 60_000 }, function () {
  const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw7-bonusPoints',
    });
    context.assessmentId = assessmentId;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  afterAll(helperServer.after);

  test.sequential('visit start exam page', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    const question1Url = response.$('a:contains("Partial credit 1")').attr('href');
    context.question1Url = `${context.siteUrl}${question1Url}`;
    const question2Url = response.$('a:contains("Partial credit 2")').attr('href');
    context.question2Url = `${context.siteUrl}${question2Url}`;
  });

  test.sequential('visit first question', async () => {
    const response = await helperClient.fetchCheerio(context.question1Url);
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  test.sequential('submit an answer to the first question', async () => {
    const response = await fetch(context.question1Url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.__variant_id,
        s: '75', // To get 75% of the question
      }),
    });
    assert.isTrue(response.ok);
  });

  test.sequential('check assessment points', async () => {
    const result = await sqldb.queryRow(
      sql.read_assessment_instance_points,
      { assessment_id: context.assessmentId },
      z.object({
        points: AssessmentInstanceSchema.shape.points,
        score_perc: AssessmentInstanceSchema.shape.score_perc,
      }),
    );
    assert.equal(result.points, 6);
    assert.equal(result.score_perc, 60);
  });

  test.sequential('visit second question', async () => {
    const response = await helperClient.fetchCheerio(context.question2Url);
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  test.sequential('submit an answer to the second question', async () => {
    const response = await fetch(context.question2Url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.__variant_id,
        s: '100', // To get 100% of the question
      }),
    });

    assert.isTrue(response.ok);
  });

  test.sequential('check assessment points', async () => {
    const result = await sqldb.queryRow(
      sql.read_assessment_instance_points,
      { assessment_id: context.assessmentId },
      z.object({
        points: AssessmentInstanceSchema.shape.points,
        score_perc: AssessmentInstanceSchema.shape.score_perc,
      }),
    );
    // 6+8 is 14, but limit should be 10+2 (max plus bonus)
    assert.equal(result.points, 12);
    assert.equal(result.score_perc, 120);
  });
});
