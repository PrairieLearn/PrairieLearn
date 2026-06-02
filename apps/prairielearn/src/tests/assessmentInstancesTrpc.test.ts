import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { SprocUsersSelectOrInsertSchema } from '../lib/db-types.js';
import { selectJobSequenceStatus } from '../lib/server-jobs.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceId = '1';

async function waitForJobSequence(jobSequenceId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const { status } = await selectJobSequenceStatus(jobSequenceId);
    if (status !== 'Running') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Job sequence ${jobSequenceId} did not finish in time`);
}

describe('assessmentInstances tRPC router', { timeout: 60_000 }, () => {
  let assessmentId: string;
  let trpcClient: ReturnType<typeof createAssessmentTrpcClient>;

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'hw1-automaticTestSuite',
    });
    assessmentId = assessment.id;

    // Loading a homework assessment as the (instructor) test user auto-creates
    // an assessment instance, giving the router something to operate on.
    await helperClient.fetchCheerio(
      `${baseUrl}/course_instance/${courseInstanceId}/assessment/${assessmentId}/`,
    );

    const csrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({ courseInstanceId, assessmentId }),
        authn_user_id: '1',
      },
      config.secretKey,
    );
    trpcClient = createAssessmentTrpcClient({
      csrfToken,
      courseInstanceId,
      assessmentId,
      urlBase: siteUrl,
    });
  });

  test.sequential('list returns the created instance', async () => {
    const rows = await trpcClient.assessmentInstances.list.query();
    assert.lengthOf(rows, 1);
    assert.isTrue(rows[0].assessment_instance.open);
  });

  test.sequential('setTimeLimit (set_rem) applies a time limit', async () => {
    const before = await trpcClient.assessmentInstances.list.query();
    await trpcClient.assessmentInstances.setTimeLimit.mutate({
      assessmentInstanceIds: [before[0].assessment_instance.id],
      action: 'set_rem',
      time_add: 30,
    });
    const after = await trpcClient.assessmentInstances.list.query();
    assert.isNotNull(after[0].time_remaining_sec);
    assert.isTrue(after[0].assessment_instance.open);
  });

  test.sequential('setTimeLimit (remove) clears the time limit', async () => {
    const before = await trpcClient.assessmentInstances.list.query();
    await trpcClient.assessmentInstances.setTimeLimit.mutate({
      assessmentInstanceIds: [before[0].assessment_instance.id],
      action: 'remove',
    });
    const after = await trpcClient.assessmentInstances.list.query();
    assert.isNull(after[0].time_remaining_sec);
    assert.isTrue(after[0].assessment_instance.open);
  });

  test.sequential('setTimeLimit accepts null ids to update all instances', async () => {
    await trpcClient.assessmentInstances.setTimeLimit.mutate({
      assessmentInstanceIds: null,
      action: 'set_rem',
      time_add: 30,
    });
    const withLimit = await trpcClient.assessmentInstances.list.query();
    assert.isNotNull(withLimit[0].time_remaining_sec);

    await trpcClient.assessmentInstances.setTimeLimit.mutate({
      assessmentInstanceIds: null,
      action: 'remove',
    });
    const withoutLimit = await trpcClient.assessmentInstances.list.query();
    assert.isNull(withoutLimit[0].time_remaining_sec);
  });

  test.sequential('setTimeLimit ignores foreign ids', async () => {
    // A foreign id simply doesn't match the assessment_id predicate, so the
    // instance for this assessment is untouched.
    await trpcClient.assessmentInstances.setTimeLimit.mutate({
      assessmentInstanceIds: ['999999999'],
      action: 'set_rem',
      time_add: 10,
    });
    const after = await trpcClient.assessmentInstances.list.query();
    assert.isNull(after[0].time_remaining_sec);
  });

  test.sequential('grade returns a job sequence', async () => {
    const rows = await trpcClient.assessmentInstances.list.query();
    const { jobSequenceId } = await trpcClient.assessmentInstances.grade.mutate({
      assessmentInstanceIds: [rows[0].assessment_instance.id],
    });
    assert.isString(jobSequenceId);
    await waitForJobSequence(jobSequenceId);
    const after = await trpcClient.assessmentInstances.list.query();
    assert.isTrue(after[0].assessment_instance.open);
  });

  test.sequential('gradeAndClose returns a job sequence and closes the instance', async () => {
    const rows = await trpcClient.assessmentInstances.list.query();
    const { jobSequenceId } = await trpcClient.assessmentInstances.gradeAndClose.mutate({
      assessmentInstanceIds: [rows[0].assessment_instance.id],
    });
    assert.isString(jobSequenceId);
    await waitForJobSequence(jobSequenceId);
    const after = await trpcClient.assessmentInstances.list.query();
    assert.isFalse(after[0].assessment_instance.open);
  });

  test.sequential('regrade returns a job sequence', async () => {
    const rows = await trpcClient.assessmentInstances.list.query();
    const { jobSequenceId } = await trpcClient.assessmentInstances.regrade.mutate({
      assessmentInstanceIds: [rows[0].assessment_instance.id],
    });
    assert.isString(jobSequenceId);
    await waitForJobSequence(jobSequenceId);
  });

  test.sequential('regradePreview accepts null ids to preview all instances', async () => {
    const questions = await trpcClient.assessmentInstances.regradePreview.query({
      assessmentInstanceIds: null,
    });
    assert.isArray(questions);
  });

  test.sequential('delete ignores foreign ids', async () => {
    await trpcClient.assessmentInstances.delete.mutate({
      assessmentInstanceIds: ['999999999'],
    });
    const after = await trpcClient.assessmentInstances.list.query();
    assert.lengthOf(after, 1);
  });

  test.sequential('delete removes the selected instance', async () => {
    const rows = await trpcClient.assessmentInstances.list.query();
    await trpcClient.assessmentInstances.delete.mutate({
      assessmentInstanceIds: [rows[0].assessment_instance.id],
    });
    const after = await trpcClient.assessmentInstances.list.query();
    assert.lengthOf(after, 0);
  });

  // The instances data was previously loaded via a `raw_data.json` endpoint
  // whose authorization was covered by `permissions/studentData.test.ts`. Those
  // tests moved here when the data moved to the `list` query, which is guarded
  // by `requireCourseInstancePermissionView`.
  describe('list authorization', () => {
    beforeAll(async () => {
      await sqldb.callRow(
        'users_select_or_insert',
        ['instructor@example.com', 'Instructor User', '100000000', 'instructor@example.com', 'dev'],
        SprocUsersSelectOrInsertSchema,
      );
      const user = await insertCoursePermissionsByUserUid({
        course_id: '1',
        uid: 'instructor@example.com',
        course_role: 'Owner',
        authn_user_id: '1',
      });
      await insertCourseInstancePermissions({
        course_id: '1',
        course_instance_id: courseInstanceId,
        user_id: user.id,
        course_instance_role: 'Student Data Editor',
        authn_user_id: '1',
      });
    });

    async function fetchInstancesList(cookie: string) {
      return await helperClient.fetchCheerio(
        `${siteUrl}${getAssessmentTrpcUrl({ courseInstanceId, assessmentId })}/assessmentInstances.list`,
        { headers: { 'X-TRPC': 'true', cookie } },
      );
    }

    test('instructor (student data editor) can list instances', async () => {
      const response = await fetchInstancesList('pl_test_user=test_instructor');
      assert.isTrue(response.ok);
    });

    test('instructor (student data viewer) can list instances', async () => {
      const response = await fetchInstancesList(
        'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
      );
      assert.isTrue(response.ok);
    });

    test('instructor (no role) cannot list instances', async () => {
      const response = await fetchInstancesList(
        'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
      );
      assert.equal(response.status, 403);
    });
  });
});
