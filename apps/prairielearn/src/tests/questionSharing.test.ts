import * as path from 'node:path';

import { assert } from 'chai';
import { execa } from 'execa';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';
import * as tmp from 'tmp';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { type Course, IdSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { getCourseCommitHash, selectCourseById } from '../models/course.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { makeMockLogger } from './mockLogger.js';
import * as syncUtil from './sync/util.js';
import { getCsrfToken } from './utils/csrf.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
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
  const token = await getCsrfToken(sharingUrl);

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
  const assessmentLink = assessmentsPage.$('a:contains("Test assessment")');
  assert.lengthOf(assessmentLink, 1);
  const sharedQuestionAssessmentUrl = siteUrl + assessmentLink.attr('href');
  const res = await fetchCheerio(sharedQuestionAssessmentUrl);
  assert.equal(res.ok, true);
  return res;
}

// Set up temporary writeable directories for shared content
const baseDir = tmp.dirSync().name;
const sharingCourseOriginDir = path.join(baseDir, 'courseOrigin');
const sharingCourseLiveDir = path.join(baseDir, 'courseLive');
const gitOptionsOrigin = {
  cwd: sharingCourseOriginDir,
  env: process.env,
};
const gitOptionsLive = {
  cwd: sharingCourseLiveDir,
  env: process.env,
};
async function commitAndPullSharingCourse() {
  await execa('git', ['add', '-A'], gitOptionsOrigin);
  await execa('git', ['commit', '-m', 'Add sharing set'], gitOptionsOrigin);
  await execa('git', ['pull'], gitOptionsLive);
  const syncResult = await syncUtil.syncCourseData(sharingCourseLiveDir);
  assert.equal(syncResult.status, 'complete');
  assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);
}

async function ensureInvalidSharingOperationFailsToSync() {
  let syncResult = await syncUtil.syncCourseData(sharingCourseLiveDir);
  assert.equal(syncResult.status, 'sharing_error');
  await execa('git', ['clean', '-fdx'], gitOptionsLive);
  await execa('git', ['reset', '--hard', 'HEAD'], gitOptionsLive);

  syncResult = await syncFromDisk.syncOrCreateDiskToSql(sharingCourseLiveDir, logger);
  assert.equal(syncResult.status, 'complete');
  assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);
}

async function syncSharingCourse(course_id) {
  const syncUrl = `${baseUrl}/course/${course_id}/course_admin/syncs`;
  const token = await getCsrfToken(syncUrl);

  await fetch(syncUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'pull',
      __csrf_token: token,
    }),
  });
  const result = await sqldb.queryOneRowAsync(sql.select_last_job_sequence, []);
  return result.rows[0].id;
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
  let sharingCourseData: syncUtil.CourseData;
  before('construct and sync course', async () => {
    sharingCourseData = syncUtil.getCourseData();
    sharingCourseData.course.name = 'SHARING 101';
    const privateQuestion = sharingCourseData.questions.private;
    sharingCourseData.questions = {
      private: privateQuestion,
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

    await syncUtil.writeCourseToDirectory(sharingCourseData, sharingCourseOriginDir);

    // Fill in empty `question.html` files for our two questions so that we can
    // view them without errors. We don't actually need any contents.
    await fs.writeFile(
      path.join(sharingCourseOriginDir, 'questions', SHARING_QUESTION_QID, 'question.html'),
      '',
    );
    await fs.writeFile(
      path.join(sharingCourseOriginDir, 'questions', PUBLICLY_SHARED_QUESTION_QID, 'question.html'),
      '',
    );
    await execa('git', ['-c', 'init.defaultBranch=master', 'init'], gitOptionsOrigin);
    await execa('git', ['add', '-A'], gitOptionsOrigin);
    await execa('git', ['commit', '-m', 'initial commit'], gitOptionsOrigin);
    await execa('mkdir', [sharingCourseLiveDir]);
    await execa('git', ['clone', sharingCourseOriginDir, sharingCourseLiveDir], {
      cwd: '.',
      env: process.env,
    });
    const syncResults = await syncUtil.syncCourseData(sharingCourseLiveDir);
    sharingCourse = await selectCourseById(syncResults.courseId);

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
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (syncResult.status === 'complete' && !syncResult?.hadJsonErrorsOrWarnings) {
        throw new Error(
          'Sync of consuming course succeeded when it should have failed due to unresolved shared question path.',
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
        const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
        if (syncResult.status !== 'complete' || syncResult?.hadJsonErrorsOrWarnings) {
          throw new Error('Errors or warnings found during sync of consuming course');
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
      assert.equal(res.status, 400);

      res = await setSharingName(sharingCourse.id, 'invalid / sharingname');
      assert.equal(res.status, 400);

      res = await setSharingName(sharingCourse.id, '');
      assert.equal(res.status, 400);
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

    step('Set sharing course sharing name', async () => {
      await setSharingName(sharingCourse.id, SHARING_COURSE_SHARING_NAME);
      const sharingPage = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        SHARING_COURSE_SHARING_NAME,
      );
    });

    step('Successfully change the sharing name when no questions have been shared', async () => {
      let res = await setSharingName(sharingCourse.id, 'Nothing shared yet');
      assert.equal(res.status, 200);

      res = await setSharingName(sharingCourse.id, SHARING_COURSE_SHARING_NAME);
      assert.equal(res.status, 200);
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

    step('Add sharing set to JSON', async () => {
      sharingCourseData.course.sharingSets = [
        { name: SHARING_SET_NAME, description: 'Sharing set for testing' },
      ];
      const courseInfoPath = path.join(sharingCourseOriginDir, 'infoCourse.json');
      await fs.writeJSON(courseInfoPath, sharingCourseData.course);

      sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [SHARING_SET_NAME];
      await fs.writeJSON(
        path.join(sharingCourseOriginDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
        sharingCourseData.questions[SHARING_QUESTION_QID],
      );

      await commitAndPullSharingCourse();
    });

    step('Share sharing set with test course', async () => {
      const sharingUrl = sharingPageUrl(sharingCourse.id);
      const response = await fetchCheerio(sharingUrl);
      const token = response.$('#test_csrf_token').text();
      const sharingSetId = await sqldb.queryRow(
        sql.select_sharing_set,
        { sharing_set_name: SHARING_SET_NAME },
        IdSchema,
      );
      const res = await fetch(sharingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_sharing_set_add',
          __csrf_token: token,
          unsafe_sharing_set_id: sharingSetId,
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

    step('Fail to change the sharing name when a question has been shared', async () => {
      const res = await setSharingName(sharingCourse.id, 'Question shared');
      assert.equal(res.status, 400);
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

    step('Publicly share a question', async () => {
      sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID].sharePublicly = true;
      await fs.writeJSON(
        path.join(sharingCourseOriginDir, 'questions', PUBLICLY_SHARED_QUESTION_QID, 'info.json'),
        sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID],
      );

      await commitAndPullSharingCourse();
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
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (syncResult?.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
        throw new Error('Errors or warnings found during sync of consuming course');
      }
    });

    step('Successfully access shared question', async () => {
      const res = await accessSharedQuestionAssessment(consumingCourse.id);
      const sharedQuestionLink = res.$('a:contains("Shared via sharing set")');
      assert.lengthOf(sharedQuestionLink, 1);
      const sharedQuestionRes = await fetchCheerio(siteUrl + sharedQuestionLink.attr('href'));
      assert(sharedQuestionRes.ok);

      const publiclySharedQuestionLink = res.$('a:contains("Shared publicly")');
      assert.lengthOf(publiclySharedQuestionLink, 1);
      const publiclySharedQuestionRes = await fetchCheerio(
        siteUrl + publiclySharedQuestionLink.attr('href'),
      );
      assert(publiclySharedQuestionRes.ok);
    });

    step('Fail to sync if shared question is renamed', async () => {
      const questionPath = path.join(sharingCourse.path, 'questions', SHARING_QUESTION_QID);
      const questionTempPath = questionPath + '_temp';
      await fs.rename(questionPath, questionTempPath);
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(sharingCourse.path, logger);
      assert.equal(
        syncResult.status,
        'sharing_error',
        'sync should not complete when attempting sync after moving shared question',
      );

      const question_id = await sqldb.queryOptionalRow(
        sql.get_question_id,
        {
          course_id: sharingCourse.id,
          qid: SHARING_QUESTION_QID,
        },
        IdSchema,
      );
      assert(
        question_id !== null,
        'Sync of consuming course should not allow renaming a shared question.',
      );
      await fs.rename(questionTempPath, questionPath);
    });

    step('Ensure sync through sync page succeeds before renaming shared question', async () => {
      await sqldb.queryAsync(sql.update_course_repository, {
        course_path: sharingCourseLiveDir,
        course_repository: sharingCourseOriginDir,
      });

      const job_sequence_id = await syncSharingCourse(sharingCourse.id);
      await helperServer.waitForJobSequenceStatus(job_sequence_id, 'Success');
    });

    step('Rename shared question in origin, ensure live does not sync it', async () => {
      const questionPath = path.join(sharingCourseOriginDir, 'questions', SHARING_QUESTION_QID);
      const questionTempPath = questionPath + '_temp';
      await fs.rename(questionPath, questionTempPath);
      await execa('git', ['add', '-A'], gitOptionsOrigin);
      await execa('git', ['commit', '-m', 'invalid sharing config edit'], gitOptionsOrigin);

      const commitHash = await getCourseCommitHash(sharingCourseLiveDir);

      const job_sequence_id = await syncSharingCourse(sharingCourse.id);
      await helperServer.waitForJobSequenceStatus(job_sequence_id, 'Error');

      assert.equal(
        commitHash,
        await getCourseCommitHash(sharingCourseLiveDir),
        'Commit hash of sharing course should not change when attempting to sync breaking change.',
      );

      const sharedQuestionExists = await fs.pathExists(
        path.join(sharingCourseLiveDir, 'questions', SHARING_QUESTION_QID),
      );
      assert(
        sharedQuestionExists,
        'When origin repo moves shared question, live should not sync that change.',
      );

      // remove breaking change in origin repo
      await execa('git', ['reset', '--hard', 'HEAD~1'], gitOptionsOrigin);

      const job_sequence_id_success = await syncSharingCourse(sharingCourse.id);
      await helperServer.waitForJobSequenceStatus(job_sequence_id_success, 'Success');
    });

    step('Remove question from sharing set, ensure live does not sync it', async () => {
      const saveSharingSets = sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets || [];
      sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [];
      await fs.writeJSON(
        path.join(sharingCourseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
        sharingCourseData.questions[SHARING_QUESTION_QID],
      );

      await ensureInvalidSharingOperationFailsToSync();

      sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = saveSharingSets;
    });

    step('Unshare a publicly shared question, ensure live does not sync it', async () => {
      sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID].sharePublicly = false;
      await fs.writeJSON(
        path.join(sharingCourseLiveDir, 'questions', PUBLICLY_SHARED_QUESTION_QID, 'info.json'),
        sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID],
      );

      await ensureInvalidSharingOperationFailsToSync();
    });

    step('Delete a sharing set, ensure live does not sync it', async () => {
      const saveSharingSets = sharingCourseData.course.sharingSets || [];
      sharingCourseData.course.sharingSets = [];
      await fs.writeJSON(
        path.join(sharingCourseLiveDir, 'infoCourse.json'),
        sharingCourseData.course,
      );

      await ensureInvalidSharingOperationFailsToSync();

      sharingCourseData.course.sharingSets = saveSharingSets;
    });

    step(
      'Try adding question to sharing set that does not exist, ensure live does not sync it',
      async () => {
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets?.push(
          'Fake Sharing Set Name',
        );
        await fs.writeJSON(
          path.join(sharingCourseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        await ensureInvalidSharingOperationFailsToSync();
      },
    );
  });
});
