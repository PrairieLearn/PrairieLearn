import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fetch from 'node-fetch';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { Course } from '../lib/db-types';
import { features } from '../lib/features/index';
import { selectCourseById } from '../models/course';
import * as syncFromDisk from '../sync/syncFromDisk';
import { fetchCheerio } from './helperClient';
import * as helperServer from './helperServer';
import { makeMockLogger } from './mockLogger';
import * as syncUtil from './sync/util';

const sql = sqldb.loadSqlEquiv(__filename);
const { logger } = makeMockLogger();

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const UUID_REGEXP = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const SHARING_COURSE_SHARING_NAME = 'sharing-course';
const CONSUMING_COURSE_SHARING_NAME = 'consuming-course';
const SHARING_SET_NAME = 'share-set-example';
const SHARING_QUESTION_QID = 'shared-via-sharing-set';
const PUBLICLY_SHARED_QUESTION_QID = 'shared-publicly';

function sharingPageUrl(courseId) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`;
}

async function setSharingName(courseId: string, name: string) {
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

async function accessSharedQuestionAssessment(course_id: string) {
  const assessmentsUrl = `${baseUrl}/course_instance/${course_id}/instructor/instance_admin/assessments`;
  const assessmentsPage = await fetchCheerio(assessmentsUrl);
  const assessmentLink = assessmentsPage.$(`a:contains("Test assessment")`);
  assert.lengthOf(assessmentLink, 1);
  const sharedQuestionAssessmentUrl = siteUrl + assessmentLink.attr('href');
  const res = await fetchCheerio(sharedQuestionAssessmentUrl);
  assert.equal(res.ok, true);
  return res;
}

describe('Question Sharing', function () {
  this.timeout(80000);
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure question sharing is globally enabled', async () => {
    await features.enable('question-sharing');
  });

  // Rather than using the example course and test course, we'll set up two courses
  // from scratch. This is necessary because the example course has hardcoded behavior
  // to prevent all question sharing features from working.
  let sharingCourse: Course;
  let consumingCourse: Course;
  before('construct and sync course', async () => {
    const sharingCourseData = syncUtil.getCourseData();
    sharingCourseData.course.name = 'SHARING 101';
    sharingCourseData.questions = {
      [SHARING_QUESTION_QID]: {
        uuid: '00000000-0000-0000-0000-000000000000',
        type: 'v3',
        title: 'Shared via sharing set',
        topic: 'TOPIC HERE',
      },
      [PUBLICLY_SHARED_QUESTION_QID]: {
        uuid: '11111111-1111-1111-1111-111111111111',
        type: 'v3',
        title: 'Shared publicly',
        topic: 'TOPIC HERE',
      },
    };

    const sharingCourseResults = await syncUtil.writeAndSyncCourseData(sharingCourseData);
    sharingCourse = await selectCourseById(sharingCourseResults.syncResults.courseId);

    // Fill in empty `question.html` files for our two questions so that we can
    // view them without errors. We don't actually need any contents.
    await fs.writeFile(
      path.join(sharingCourse.path, 'questions', SHARING_QUESTION_QID, 'question.html'),
      '',
    );
    await fs.writeFile(
      path.join(sharingCourse.path, 'questions', PUBLICLY_SHARED_QUESTION_QID, 'question.html'),
      '',
    );

    const consumingCourseData = syncUtil.getCourseData();
    consumingCourseData.course.name = 'CONSUMING 101';
    consumingCourseData.courseInstances[syncUtil.COURSE_INSTANCE_ID].assessments[
      syncUtil.ASSESSMENT_ID
    ].zones = [
      {
        questions: [
          {
            id: `@${SHARING_COURSE_SHARING_NAME}/${SHARING_QUESTION_QID}`,
            points: 1,
          },
          {
            id: `@${SHARING_COURSE_SHARING_NAME}/${PUBLICLY_SHARED_QUESTION_QID}`,
            points: 1,
          },
        ],
      },
    ];
    const consumingCourseResults = await syncUtil.writeAndSyncCourseData(consumingCourseData);
    consumingCourse = await selectCourseById(consumingCourseResults.syncResults.courseId);
  });

  describe('Test syncing code to identify missing shared question', function () {
    before('alter config to check sharing on sync', () => {
      config.checkSharingOnSync = true;
    });
    after('reset config', () => {
      config.checkSharingOnSync = false;
    });

    step('Fail to sync course when validating shared question paths', async () => {
      const result = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (!result?.hadJsonErrorsOrWarnings) {
        throw new Error(
          `Sync of consuming course succeeded when it should have failed due to unresolved shared question path.`,
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
        const result = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
        if (result?.hadJsonErrorsOrWarnings) {
          throw new Error(`Errors or warnings found during sync of consuming course`);
        }
      },
    );

    step(
      'Fail to access shared question, because permission has not yet been granted',
      async () => {
        // Since permissions aren't yet granted, the shared question doesn't show up on the assessment page
        const res = await accessSharedQuestionAssessment(consumingCourse.id);
        assert(!(await res.text()).includes(SHARING_QUESTION_QID));

        // Question can be accessed through the owning course
        const questionId = (
          await sqldb.queryOneRowAsync(sql.get_question_id, {
            course_id: sharingCourse.id,
            qid: SHARING_QUESTION_QID,
          })
        ).rows[0].id;
        const sharedQuestionUrl = `${baseUrl}/course_instance/${sharingCourse.id}/instructor/question/${questionId}`;
        const sharedQuestionPage = await fetchCheerio(sharedQuestionUrl);
        assert(sharedQuestionPage.ok);

        // Question cannot be accessed through the consuming course, sharing permissions not yet set
        const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${consumingCourse.id}/instructor/question/${questionId}/settings`;
        const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
        assert(!sharedQuestionSharedPage.ok);
      },
    );

    step('Fail if trying to set an invalid sharing name', async () => {
      let res = await setSharingName(sharingCourse.id, 'invalid@sharingname');
      assert(res.status === 400);

      res = await setSharingName(sharingCourse.id, 'invalid / sharingname');
      assert(res.status === 400);

      res = await setSharingName(sharingCourse.id, '');
      assert(res.status === 400);
    });

    step('Set consuming course sharing name', async () => {
      await setSharingName(consumingCourse.id, CONSUMING_COURSE_SHARING_NAME);
      const sharingPage = await fetchCheerio(sharingPageUrl(consumingCourse.id));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        CONSUMING_COURSE_SHARING_NAME,
      );
    });

    // TODO: fix this test?
    step('Fail if trying to set sharing name again.', async () => {
      const result = await setSharingName(consumingCourse.id, CONSUMING_COURSE_SHARING_NAME);
      assert.equal(result.status, 200);
    });

    step('Set sharing course sharing name', async () => {
      await setSharingName(sharingCourse.id, SHARING_COURSE_SHARING_NAME);
      const sharingPage = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        SHARING_COURSE_SHARING_NAME,
      );
    });

    step('Generate and get sharing token for sharing course', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
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

    step('Get default sharing token for consuming course', async () => {
      const sharingUrl = sharingPageUrl(consumingCourse.id);
      const response = await fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(await response.text());
      testCourseSharingToken = result ? result[0] : null;
      assert(testCourseSharingToken != null);
    });

    step('Create a sharing set', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_set_create',
          __csrf_token: token,
          sharing_set_name: SHARING_SET_NAME,
        }),
      });
    });

    step('Attempt to create another sharing set with the same name', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const result = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'sharing_set_create',
          __csrf_token: token,
          sharing_set_name: SHARING_SET_NAME,
        }),
      });
      assert.equal(result.status, 500);
    });

    step('Share sharing set with test course', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
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

      const sharingPage = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      assert(sharingPage.ok);
      assert.include(sharingPage.$('[data-testid="shared-with"]').text(), 'CONSUMING 101');
    });

    step('Attempt to share sharing set with invalid course token', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
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
      const sharingUrl = sharingPageUrl(sharingCourse.id);
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
      const sharingUrl = sharingPageUrl(consumingCourse.id);
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

    step(`Add question "${SHARING_QUESTION_QID}" to sharing set`, async () => {
      const result = await sqldb.queryOneRowAsync(sql.get_question_id, {
        course_id: sharingCourse.id,
        qid: SHARING_QUESTION_QID,
      });
      const questionSettingsUrl = `${baseUrl}/course_instance/${sharingCourse.id}/instructor/question/${result.rows[0].id}/settings`;
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
      assert.include(
        settingsPageResponse.$('[data-testid="shared-with"]').text(),
        SHARING_SET_NAME,
      );
    });
  });

  describe('Test Sharing a Question Publicly', function () {
    let publiclySharedQuestionId;

    before('Get id for publicly shared question', async () => {
      publiclySharedQuestionId = (
        await sqldb.queryOneRowAsync(sql.get_question_id, {
          course_id: sharingCourse.id,
          qid: PUBLICLY_SHARED_QUESTION_QID,
        })
      ).rows[0].id;
    });

    step('Fail to Access Questions Not-yet shared publicly', async () => {
      const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${consumingCourse.id}/instructor/question/${publiclySharedQuestionId}`;
      const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
      assert(!sharedQuestionSharedPage.ok);
    });

    step('Mark question as shared publicly', async () => {
      const publiclySharedQuestionUrl = `${baseUrl}/course_instance/${sharingCourse.id}/instructor/question/${publiclySharedQuestionId}/settings`;
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
      const sharedQuestionSharedUrl = `${baseUrl}/course_instance/${consumingCourse.id}/instructor/question/${publiclySharedQuestionId}`;
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
      const result = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (result === undefined || result.hadJsonErrorsOrWarnings) {
        console.log(result);
        throw new Error(`Errors or warnings found during sync of consuming course`);
      }
    });

    step('Successfully access shared question', async () => {
      const res = await accessSharedQuestionAssessment(consumingCourse.id);
      const sharedQuestionLink = res.$(`a:contains("Shared via sharing set")`);
      assert.lengthOf(sharedQuestionLink, 1);
      const sharedQuestionRes = await fetchCheerio(siteUrl + sharedQuestionLink.attr('href'));
      assert(sharedQuestionRes.ok);

      const publiclySharedQuestionLink = res.$(`a:contains("Shared publicly")`);
      assert.lengthOf(publiclySharedQuestionLink, 1);
      const publiclySharedQuestionRes = await fetchCheerio(
        siteUrl + publiclySharedQuestionLink.attr('href'),
      );
      assert(publiclySharedQuestionRes.ok);
    });
  });
});
