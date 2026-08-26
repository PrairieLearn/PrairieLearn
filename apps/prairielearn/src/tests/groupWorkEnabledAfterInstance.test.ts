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

async function selectHw1() {
  return await selectAssessmentByTid({
    course_instance_id: '1',
    tid: 'hw1-automaticTestSuite',
  });
}

async function selectFirstInstanceQuestionId(assessmentInstanceId: string) {
  return await queryScalar(
    sql.select_first_instance_question,
    { assessment_instance_id: assessmentInstanceId },
    IdSchema,
  );
}

const UNAUTHORIZED_EDIT_WARNING = 'You are viewing the assessment of a different user';

async function assertOrphanInstancePagesLoad({
  assessment,
  assessmentInstanceId,
  instanceQuestionId,
}: {
  assessment: Assessment;
  assessmentInstanceId: string;
  instanceQuestionId: string;
}) {
  const urls = [
    `${courseInstanceUrl}/assessment_instance/${assessmentInstanceId}`,
    `${courseInstanceUrl}/instance_question/${instanceQuestionId}/`,
    `${courseInstanceUrl}/instructor/assessment/${assessment.id}/instances`,
    `${courseInstanceUrl}/instructor/assessment_instance/${assessmentInstanceId}`,
  ];
  for (const url of urls) {
    const res = await fetchCheerio(url);
    assert.equal(res.status, 200);
  }
}

async function assertNotRedirectedToStaleInstance(
  assessmentId: string,
  staleAssessmentInstanceId: string,
) {
  const res = await fetchCheerio(`${courseInstanceUrl}/assessment/${assessmentId}`);
  assert.equal(res.status, 200);
  const match = res.url.match(/\/assessment_instance\/(\d+)/);
  if (match) {
    assert.notEqual(match[1], staleAssessmentInstanceId);
  }
}

async function assertOriginalOwnerStillOwnsInstance(assessmentInstanceId: string) {
  const res = await fetchCheerio(
    `${courseInstanceUrl}/assessment_instance/${assessmentInstanceId}`,
  );
  assert.equal(res.status, 200);
  assert.notInclude(res.$('body').text(), UNAUTHORIZED_EDIT_WARNING);
}

async function assertAssessmentsListingDoesNotLinkToStaleInstance(
  staleAssessmentInstanceId: string,
) {
  const res = await fetchCheerio(`${courseInstanceUrl}/assessments`);
  assert.equal(res.status, 200);
  const links = res.$(`a[href*="/assessment_instance/${staleAssessmentInstanceId}"]`).toArray();
  assert.lengthOf(links, 0);
}

// Regression test for instances whose team_id/team_work state has diverged
// from the parent assessment.team_work after an instructor toggled group work.
describe('Assessment instance with mismatched team_work state', { timeout: 60_000 }, () => {
  describe('group work enabled after a non-group instance was created', () => {
    let assessment: Assessment;
    let assessmentInstanceId: string;
    let instanceQuestionId: string;

    beforeAll(async () => {
      await helperServer.before()();

      assessment = await selectHw1();

      // Trigger dev user enrollment so we can resolve their user_id.
      await fetchCheerio(`${courseInstanceUrl}`);
      const devUser = await selectUserByUid('dev@example.com');

      assessmentInstanceId = await makeAssessmentInstance({
        assessment,
        user_id: devUser.id,
        authn_user_id: devUser.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });

      const ai = await selectAssessmentInstanceById(assessmentInstanceId);
      assert.isNotNull(ai.user_id);
      assert.isNull(ai.team_id);

      instanceQuestionId = await selectFirstInstanceQuestionId(assessmentInstanceId);

      await execute(sql.enable_group_work, { assessment_id: assessment.id });
    });

    afterAll(helperServer.after);

    test('student is not redirected to the orphan instance', async () => {
      await assertNotRedirectedToStaleInstance(assessment.id, assessmentInstanceId);
    });

    test('all pages load without crashing', async () => {
      await assertOrphanInstancePagesLoad({ assessment, assessmentInstanceId, instanceQuestionId });
    });

    test('original owner is still recognized as owning the instance', async () => {
      await assertOriginalOwnerStillOwnsInstance(assessmentInstanceId);
    });

    test('assessments listing does not link to the stale instance', async () => {
      await assertAssessmentsListingDoesNotLinkToStaleInstance(assessmentInstanceId);
    });
  });

  describe('group work disabled after a group instance was created', () => {
    let assessment: Assessment;
    let assessmentInstanceId: string;
    let instanceQuestionId: string;

    beforeAll(async () => {
      await helperServer.before()();

      assessment = await selectHw1();

      // Trigger dev user enrollment so we can resolve their user_id.
      await fetchCheerio(`${courseInstanceUrl}`);
      const devUser = await selectUserByUid('dev@example.com');

      await execute(sql.enable_group_work, { assessment_id: assessment.id });
      const groupAssessment = await selectHw1();
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

      instanceQuestionId = await selectFirstInstanceQuestionId(assessmentInstanceId);

      await execute(sql.disable_group_work, { assessment_id: assessment.id });
    });

    afterAll(helperServer.after);

    test('student is not redirected to the orphan instance', async () => {
      await assertNotRedirectedToStaleInstance(assessment.id, assessmentInstanceId);
    });

    test('all pages load without crashing', async () => {
      await assertOrphanInstancePagesLoad({ assessment, assessmentInstanceId, instanceQuestionId });
    });

    test('original owner is still recognized as owning the instance', async () => {
      await assertOriginalOwnerStillOwnsInstance(assessmentInstanceId);
    });

    test('assessments listing does not link to the stale instance', async () => {
      await assertAssessmentsListingDoesNotLinkToStaleInstance(assessmentInstanceId);
    });
  });
});
