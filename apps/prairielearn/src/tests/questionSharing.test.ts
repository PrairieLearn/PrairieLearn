import { assert } from 'chai';
import { step } from 'mocha-steps';
import { config } from '../lib/config';
import fetch from 'node-fetch';
import { fetchCheerio } from './helperClient';
import * as helperServer from './helperServer';
import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(__filename);
import { features } from '../lib/features/index';
import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from '../lib/paths';

import * as syncFromDisk from '../sync/syncFromDisk';

import { makeMockLogger } from './mockLogger';
const { logger } = makeMockLogger();

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const UUID_REGEXP = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const testCourseId = 2;
const testCourseSharingName = 'test-course';
const exampleCourseId = 1;
const exampleCourseSharingName = 'example-course';
const sharingSetName = 'share-set-example';
const sharedQuestionQid = 'element/numberInput';
const publiclySharedQuestionQid = 'element/orderBlocks';
let publiclySharedQuestionId;

function sharingPageUrl(courseId) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`;
}

async function setSharingName(courseId, name) {
  const sharingUrl = sharingPageUrl(courseId);
  const response = await fetchCheerio(sharingUrl);

  const token = response.$('#test_csrf_token').text();
  return await fetch(sharingUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'choose_sharing_name',
      __csrf_token: token,
      course_sharing_name: name,
    }),
  });
}

async function accessSharedQuestionAssessment() {
  const assessmentsUrl = `${baseUrl}/course_instance/${testCourseId}/instructor/instance_admin/assessments`;
  const assessmentsPage = await fetchCheerio(assessmentsUrl);
  const sharedQuestionAssessmentUrl =
    siteUrl +
    assessmentsPage.$(`a:contains("Test of Consuming Questions From Another Course")`).attr('href');
  const res = await fetchCheerio(sharedQuestionAssessmentUrl);
  assert.equal(res.ok, true);
  return res;
}

describe('Question Sharing', function () {
  this.timeout(80000);
  before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await features.enable('question-sharing');
  });

  describe('Test syncing code to identify missing shared question', function () {
    before('alter config to check sharing on sync', () => {
      config.checkSharingOnSync = true;
    });
    after('reset config', () => {
      config.checkSharingOnSync = false;
    });

    step('Fail to sync course when validating shared question paths', async () => {
      const result = await syncFromDisk.syncOrCreateDiskToSql(TEST_COURSE_PATH, logger);
      if (!result?.hadJsonErrorsOrWarnings) {
        throw new Error(
          `Sync of ${TEST_COURSE_PATH} succeeded when it should have failed due to unresolved shared question path.`,
        );
      }
    });
  });

  describe('Create a sharing set and add a question to it', () => {
    let exampleCourseSharingToken;
    let testCourseSharingToken;

    step(
      'Sync course with sharing enabled, disabling validating shared question paths',
      async () => {
        const result = await syncFromDisk.syncOrCreateDiskToSql(TEST_COURSE_PATH, logger);
        if (result?.hadJsonErrorsOrWarnings) {
          throw new Error(`Errors or warnings found during sync of ${TEST_COURSE_PATH}`);
        }
      },
    );

    step(
      'Fail to access shared question, because permission has not yet been granted',
      async () => {
        // Since permissions aren't yet granted, the shared question doesn't show up on the assessment page
        const res = await accessSharedQuestionAssessment();
        assert(!(await res.text()).includes(sharedQuestionQid));

        // Question can be accessed through the owning course
        const questionId = (
          await sqldb.queryOneRowAsync(sql.get_question_id, {
            course_id: exampleCourseId,
            qid: sharedQuestionQid,
          })
        ).rows[0].id;
        const sharedQuestionUrl = `${baseUrl}/course_instance/${exampleCourseId}/instructor/question/${questionId}`;
        const sharedQuestionPage = await fetchCheerio(sharedQuestionUrl);
        assert(sharedQuestionPage.ok);

        // Question cannot be accessed through the consuming course, sharing permissions not yet set
        const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${testCourseId}/instructor/question/${questionId}/settings`;
        const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
        assert(!sharedQuestionSharedPage.ok);
      },
    );

    step('Fail if trying to set an invalid sharing name', async () => {
      let res = await setSharingName(testCourseId, 'invalid@sharingname');
      assert(res.status === 400);

      res = await setSharingName(testCourseId, 'invalid / sharingname');
      assert(res.status === 400);

      res = await setSharingName(testCourseId, '');
      assert(res.status === 400);
    });

    step('Set test course sharing name', async () => {
      await setSharingName(testCourseId, testCourseSharingName);
      const sharingPage = await fetchCheerio(sharingPageUrl(testCourseId));
      assert(sharingPage.ok);
      assert.include(sharingPage.$('[data-testid="sharing-name"]').text(), testCourseSharingName);
    });

    step('Fail if trying to set sharing name again.', async () => {
      const result = await setSharingName(testCourseId, testCourseSharingName);
      assert.equal(result.status, 200);
    });

    step('Set example course sharing name', async () => {
      await setSharingName(exampleCourseId, exampleCourseSharingName);
      const sharingPage = await fetchCheerio(sharingPageUrl(exampleCourseId));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        exampleCourseSharingName,
      );
    });

    step('Generate and get sharing token for example course', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      let response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_token_regenerate',
          __csrf_token: token,
        }),
      });

      response = await fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(await response.text());
      exampleCourseSharingToken = result ? result[0] : null;
      assert(exampleCourseSharingToken != null);
    });

    step('Get default sharing token for test course', async () => {
      const sharingUrl = sharingPageUrl(testCourseId);
      const response = await fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(await response.text());
      testCourseSharingToken = result ? result[0] : null;
      assert(testCourseSharingToken != null);
    });

    step('Create a sharing set', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_set_create',
          __csrf_token: token,
          sharing_set_name: sharingSetName,
        }),
      });
    });

    step('Attempt to create another sharing set with the same name', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const result = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_set_create',
          __csrf_token: token,
          sharing_set_name: sharingSetName,
        }),
      });
      assert.equal(result.status, 500);
    });

    step('Share sharing set with test course', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const res = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: '1',
          unsafe_course_sharing_token: testCourseSharingToken,
        }),
      });
      assert(res.ok);

      const sharingPage = await fetchCheerio(sharingPageUrl(exampleCourseId));
      assert(sharingPage.ok);
      assert.include(sharingPage.$('[data-testid="shared-with"]').text(), 'QA 101');
    });

    step('Attempt to share sharing set with invalid course token', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const res = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: '1',
          unsafe_course_sharing_token: 'invalid sharing token',
        }),
      });
      assert.equal(res.status, 400);
    });

    step('Attempt to share sharing set with own course', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const res = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: '1',
          unsafe_course_sharing_token: exampleCourseSharingToken,
        }),
      });
      assert.equal(res.status, 400);
    });

    step('Attempt to share sharing set that does not belong to the course', async () => {
      const sharingUrl = sharingPageUrl(testCourseId);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const res = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: '1',
          unsafe_course_sharing_token: exampleCourseSharingToken,
        }),
      });
      assert.equal(res.status, 400);
    });

    step(`Add question "${sharedQuestionQid}" to sharing set`, async () => {
      const result = await sqldb.queryOneRowAsync(sql.get_question_id, {
        course_id: exampleCourseId,
        qid: sharedQuestionQid,
      });
      const questionSettingsUrl = `${baseUrl}/course_instance/${exampleCourseId}/instructor/question/${result.rows[0].id}/settings`;
      const resGet = await fetchCheerio(questionSettingsUrl);
      assert(resGet.ok);

      const token = resGet.$('#test_csrf_token').text();
      const resPost = await fetch(questionSettingsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: '1',
        }),
      });
      assert(resPost.ok);

      const settingsPageResponse = await fetchCheerio(questionSettingsUrl);
      assert.include(settingsPageResponse.$('[data-testid="shared-with"]').text(), sharingSetName);
    });
  });

  describe('Test Sharing a Question Publicly', function () {
    before('Get id for publicly shared question', async () => {
      publiclySharedQuestionId = (
        await sqldb.queryOneRowAsync(sql.get_question_id, {
          course_id: exampleCourseId,
          qid: publiclySharedQuestionQid,
        })
      ).rows[0].id;
    });

    step('Fail to Access Questions Not-yet shared publicly', async () => {
      const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${testCourseId}/instructor/question/${publiclySharedQuestionId}`;
      const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
      assert(!sharedQuestionSharedPage.ok);
    });

    step('Mark question as shared publicly', async () => {
      const publiclySharedQuestionUrl = `${baseUrl}/course_instance/${exampleCourseId}/instructor/question/${publiclySharedQuestionId}/settings`;
      const sharedQuestionSettingsPage = await fetchCheerio(publiclySharedQuestionUrl);
      assert(sharedQuestionSettingsPage.ok);

      const token = sharedQuestionSettingsPage.$('#test_csrf_token').text();
      const resPost = await fetch(publiclySharedQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'share_publicly',
          __csrf_token: token,
        }),
      });
      assert(resPost.ok);

      const settingsPageResponse = await fetchCheerio(publiclySharedQuestionUrl);
      assert.include(
        settingsPageResponse.$('[data-testid="shared-with"]').text(),
        'This question is publicly shared.',
      );
    });

    step('Successfully access publicly shared question through other course', async () => {
      const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${testCourseId}/instructor/question/${publiclySharedQuestionId}`;
      const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
      assert(sharedQuestionSharedPage.ok);
    });
  });

  describe('Test syncing code succeeding once questions have been shared', function () {
    before('alter config to check sharing on sync', () => {
      config.checkSharingOnSync = true;
    });
    after('reset config', () => {
      config.checkSharingOnSync = false;
    });
    step('Re-sync test course, validating shared questions', async () => {
      const result = await syncFromDisk.syncOrCreateDiskToSql(TEST_COURSE_PATH, logger);
      if (result === undefined || result.hadJsonErrorsOrWarnings) {
        throw new Error(`Errors or warnings found during sync of ${TEST_COURSE_PATH}`);
      }
    });

    step('Successfully access shared question', async () => {
      const res = await accessSharedQuestionAssessment();
      const sharedQuestionUrl =
        siteUrl + res.$(`a:contains("Input of real and complex numbers")`).attr('href');
      const sharedQuestionRes = await fetchCheerio(sharedQuestionUrl);
      assert(sharedQuestionRes.ok);

      const publiclySharedQuestionUrl =
        siteUrl +
        res.$(`a:contains("Dragging blocks to form the solution of a problem")`).attr('href');
      const publiclySharedQuestionRes = await fetchCheerio(publiclySharedQuestionUrl);
      assert(publiclySharedQuestionRes.ok);
    });
  });
});
