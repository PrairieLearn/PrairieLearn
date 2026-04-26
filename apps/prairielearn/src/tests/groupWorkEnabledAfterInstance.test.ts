import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { type Assessment } from '../lib/db-types.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;

// Regression test for the scenario where a homework assessment_instance was
// created before group work was enabled on the assessment.
describe('Group work enabled after assessment instance was created', { timeout: 60_000 }, () => {
  let assessment: Assessment;
  let assessmentInstanceId: string;
  let instanceQuestionId: string;

  beforeAll(async () => {
    await helperServer.before()();

    assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
  });

  afterAll(helperServer.after);

  test.sequential('instructor creates a homework instance with no group work', async () => {
    const res = await fetchCheerio(`${courseInstanceUrl}/assessment/${assessment.id}`);
    assert.equal(res.status, 200);

    // We will be redirected to the assessment instance page, and we can get the assessment instance ID from the URL.
    assessmentInstanceId = new URL(res.url).pathname.split('/').pop() ?? '';

    const ai = await selectAssessmentInstanceById(assessmentInstanceId);
    assert.isNotNull(ai.user_id);
    assert.isNull(ai.team_id);

    instanceQuestionId = await queryScalar(
      sql.select_first_instance_question,
      { assessment_instance_id: assessmentInstanceId },
      IdSchema,
    );
  });

  test.sequential('group work is enabled on the assessment after the fact', async () => {
    await execute(sql.enable_group_work, { assessment_id: assessment.id });
  });

  test.sequential('student assessment URL no longer redirects to the stale instance', async () => {
    const res = await fetchCheerio(`${courseInstanceUrl}/assessment/${assessment.id}`);
    assert.equal(res.status, 200);
    assert.notMatch(res.url, /\/assessment_instance\//);
  });

  test.sequential('student assessment instance page loads without crashing', async () => {
    const res = await fetchCheerio(
      `${courseInstanceUrl}/assessment_instance/${assessmentInstanceId}`,
    );
    assert.equal(res.status, 200);
  });

  test.sequential('student instance question page loads without crashing', async () => {
    const res = await fetchCheerio(`${courseInstanceUrl}/instance_question/${instanceQuestionId}/`);
    assert.equal(res.status, 200);
  });

  test.sequential('instructor assessment instances page loads', async () => {
    const res = await fetchCheerio(
      `${courseInstanceUrl}/instructor/assessment/${assessment.id}/instances`,
    );
    assert.equal(res.status, 200);
  });

  test.sequential('instructor assessment instance detail page loads', async () => {
    const res = await fetchCheerio(
      `${courseInstanceUrl}/instructor/assessment_instance/${assessmentInstanceId}`,
    );
    assert.equal(res.status, 200);
  });
});
