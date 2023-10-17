import { assert } from 'chai';
import { step } from 'mocha-steps';
import { config } from '../lib/config';
import fetch from 'node-fetch';
import helperClient = require('./helperClient');
import helperServer = require('./helperServer');
import sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
import { features } from '../lib/features/index';
import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from '../lib/paths';

import syncFromDisk = require('../sync/syncFromDisk');

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

function sharingPageUrl(courseId) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`;
}

async function setSharingName(courseId, name) {
  const sharingUrl = sharingPageUrl(courseId);
  const response = await helperClient.fetchCheerio(sharingUrl);

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
  const assessmentsPage = await helperClient.fetchCheerio(assessmentsUrl);
  const sharedQuestionAssessmentUrl =
    siteUrl +
    assessmentsPage.$(`a:contains("Test of Importing Questions From Another Course")`).attr('href');
  const res = await helperClient.fetchCheerio(sharedQuestionAssessmentUrl);
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
      const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(TEST_COURSE_PATH, logger);
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
        const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(TEST_COURSE_PATH, logger);
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
        assert(!res.text().includes(sharedQuestionQid));

        // Question can be accessed through the owning course
        const questionId = (
          await sqldb.queryOneRowAsync(sql.get_question_id, {
            course_id: exampleCourseId,
            qid: sharedQuestionQid,
          })
        ).rows[0].id;
        const sharedQuestionUrl = `${baseUrl}/course_instance/${exampleCourseId}/instructor/question/${questionId}/settings`;
        const sharedQuestionPage = await helperClient.fetchCheerio(sharedQuestionUrl);
        assert(sharedQuestionPage.ok);

        // Question cannot be accessed through the consuming course, sharing permissions not yet set
        const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${testCourseId}/instructor/question/${questionId}/settings`;
        const sharedQuestionSharedPage = await helperClient.fetchCheerio(sharedQuestionSharedUrl);
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
      const sharingPage = await fetch(sharingPageUrl(testCourseId));
      assert(sharingPage.ok);
      const sharingPageText = await sharingPage.text();
      assert(sharingPageText.includes(testCourseSharingName));
    });

    step('Fail if trying to set sharing name again.', async () => {
      const result = await setSharingName(testCourseId, testCourseSharingName);
      assert.equal(result.status, 200);
    });

    step('Set example course sharing name', async () => {
      await setSharingName(exampleCourseId, exampleCourseSharingName);
      const sharingPage = await fetch(sharingPageUrl(exampleCourseId));
      assert(sharingPage.ok);
      const sharingPageText = await sharingPage.text();
      assert(sharingPageText.includes(exampleCourseSharingName));
    });

    step('Generate and get sharing token for example course', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      let response = await helperClient.fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_token_regenerate',
          __csrf_token: token,
        }),
      });

      response = await helperClient.fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(response.text());
      exampleCourseSharingToken = result ? result[0] : null;
      assert(exampleCourseSharingToken != null);
    });

    step('Get default sharing token for test course', async () => {
      const sharingUrl = sharingPageUrl(testCourseId);
      const response = await helperClient.fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(response.text());
      testCourseSharingToken = result ? result[0] : null;
      assert(testCourseSharingToken != null);
    });

    step('Create a sharing set', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const sharingPage = await fetch(sharingPageUrl(testCourseId));
      assert(sharingPage.ok);
      const sharingPageText = await sharingPage.text();
      assert(sharingPageText.includes('XC 101'));
    });

    step('Attempt to share sharing set with invalid course token', async () => {
      const sharingUrl = sharingPageUrl(exampleCourseId);
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const response = await helperClient.fetchCheerio(sharingUrl);
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
      const resGet = await helperClient.fetchCheerio(questionSettingsUrl);
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
      const settingsPageResponse = await helperClient.fetchCheerio(questionSettingsUrl);
      assert(settingsPageResponse.text().includes('share-set-example'));
    });
  });

  describe('Test syncing code succeeding once question is added to sharing set', function () {
    before('alter config to check sharing on sync', () => {
      config.checkSharingOnSync = true;
    });
    after('reset config', () => {
      config.checkSharingOnSync = false;
    });
    step('Re-sync test course, validating shared questions', async () => {
      const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(TEST_COURSE_PATH, logger);
      if (result === undefined || result.hadJsonErrorsOrWarnings) {
        throw new Error(`Errors or warnings found during sync of ${TEST_COURSE_PATH}`);
      }
    });

    step('Successfully access shared question', async () => {
      let res = await accessSharedQuestionAssessment();
      const sharedQuestionUrl =
        siteUrl + res.$(`a:contains("Input of real and complex numbers")`).attr('href');

      res = await helperClient.fetchCheerio(sharedQuestionUrl);
      assert(res.ok);
    });
  });
});
