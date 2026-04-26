import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { type Assessment } from '../lib/db-types.js';
import { createGroup } from '../lib/groups.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectUserByUid } from '../models/user.js';

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

// Mirror regression test for the scenario where a homework assessment_instance
// was created as a group instance, then group work was disabled on the
// assessment.
describe('Group work disabled after assessment instance was created', { timeout: 60_000 }, () => {
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

  test.sequential('a group assessment instance is created', async () => {
    // Trigger dev user enrollment so we can resolve their user_id.
    await fetchCheerio(`${courseInstanceUrl}`);
    const devUser = await selectUserByUid('dev@example.com');

    await execute(sql.enable_group_work, { assessment_id: assessment.id });
    // Re-fetch so res.locals sees team_work=true via the assessment helper.
    const groupAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });

    const courseInstance = await selectCourseInstanceById('1');
    await createGroup({
      course_instance: courseInstance,
      assessment: groupAssessment,
      group_name: 'devgroup',
      uids: [devUser.uid],
      authn_user_id: devUser.id,
      authzData: dangerousFullSystemAuthz(),
    });

    assessmentInstanceId = await makeAssessmentInstance({
      assessment: groupAssessment,
      user_id: devUser.id,
      authn_user_id: devUser.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });

    const ai = await selectAssessmentInstanceById(assessmentInstanceId);
    assert.isNull(ai.user_id);
    assert.isNotNull(ai.team_id);

    instanceQuestionId = await queryScalar(
      sql.select_first_instance_question,
      { assessment_instance_id: assessmentInstanceId },
      IdSchema,
    );
  });

  test.sequential('group work is disabled on the assessment after the fact', async () => {
    await execute(sql.disable_group_work, { assessment_id: assessment.id });
  });

  test.sequential('student assessment URL no longer redirects to the stale instance', async () => {
    const res = await fetchCheerio(`${courseInstanceUrl}/assessment/${assessment.id}`);
    assert.equal(res.status, 200);
    // For a non-group homework with no existing user-owned instance, the
    // student page would normally redirect to a fresh instance. The orphan
    // group instance must not be matched by the redirect query.
    if (res.url.includes('/assessment_instance/')) {
      const newInstanceId = new URL(res.url).pathname.split('/').pop();
      assert.notEqual(newInstanceId, assessmentInstanceId);
    }
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
