/* eslint-disable @typescript-eslint/dot-notation */
import * as path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getAppError } from '../lib/client/errors.js';
import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { pullAndUpdateCourse } from '../lib/course.js';
import { type Course } from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editorUtil.js';
import { features } from '../lib/features/index.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { getCourseCommitHash, selectCourseById } from '../models/course.js';
import {
  selectOptionalQuestionByQid,
  selectQuestionByQid,
  updateQuestion,
} from '../models/question.js';
import { selectOptionalSharingSetByName } from '../models/sharing-set.js';
import { selectUserByUid } from '../models/user.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';
import type { SharingError } from '../trpc/course/sharing.js';

import { fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { makeMockLogger } from './mockLogger.js';
import * as syncUtil from './sync/util.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const { logger } = makeMockLogger();

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const UUID_REGEXP = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const SHARING_COURSE_SHARING_NAME = 'sharing-course';
const CONSUMING_COURSE_SHARING_NAME = 'consuming-course';
const SHARING_SET_NAME = 'share-set-example';
const UNGRANTED_SHARING_SET_NAME = 'share-set-no-consumer';
const SHARING_QUESTION_QID = 'shared-via-sharing-set';
const UNUSED_SHARING_SET_QUESTION_QID = 'unused-shared-via-sharing-set';
const PUBLICLY_SHARED_QUESTION_QID = 'shared-publicly';
const UNUSED_PUBLICLY_SHARED_QUESTION_QID = 'unused-shared-publicly';
const UNUSED_RENAMEABLE_QUESTION_QID = 'unused-renameable';
const ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID = 'public-assessment-only-question';
const DRAFT_QUESTION_QID = '__drafts__/draft_1';

function sharingPageUrl(courseId: string) {
  return `${baseUrl}/course/${courseId}/course_admin/sharing`;
}

let devUserId: string;

async function getDevUserId() {
  if (devUserId) return devUserId;
  devUserId = (await selectUserByUid('dev@example.com')).id;
  return devUserId;
}

async function sharingTrpcClient(courseId: string) {
  const authnUserId = await getDevUserId();
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl(courseId), authn_user_id: authnUserId },
    config.secretKey,
  );
  return createCourseTrpcClient({ csrfToken, courseId, urlBase: siteUrl });
}

async function setSharingName(courseId: string, name: string) {
  const client = await sharingTrpcClient(courseId);
  await client.sharing.chooseSharingName.mutate({ courseSharingName: name });
}

async function updateCourseExampleCourse({
  course_id,
  example_course,
}: {
  course_id: string;
  example_course: boolean;
}) {
  await sqldb.execute(sql.update_course_example_course, { course_id, example_course });
}

async function accessSharedQuestionAssessment(course_instance_id: string) {
  const assessmentsUrl = `${baseUrl}/course_instance/${course_instance_id}/instructor/instance_admin/assessments`;
  const assessmentsPage = await fetchCheerio(assessmentsUrl);
  const assessmentLink = assessmentsPage.$('a:contains("Test assessment")');
  assert.lengthOf(assessmentLink, 1);
  const sharedQuestionAssessmentUrl = siteUrl + assessmentLink.attr('href');
  const res = await fetchCheerio(sharedQuestionAssessmentUrl);
  assert.equal(res.ok, true);
  return res;
}

let courseRepo: CourseRepoFixture;

async function commitAndPullSharingCourse() {
  await execa('git', ['add', '-A'], { cwd: courseRepo.courseOriginDir });
  await execa('git', ['commit', '-m', 'Add sharing set'], { cwd: courseRepo.courseOriginDir });
  await execa('git', ['pull'], { cwd: courseRepo.courseLiveDir });
  const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
  assert.equal(syncResult.status, 'complete');
  assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);
}

async function ensureInvalidSharingOperationFailsToSync(): Promise<string> {
  const { logger: capturedLogger, getOutput } = makeMockLogger();
  let syncResult = await syncFromDisk.syncOrCreateDiskToSql(
    courseRepo.courseLiveDir,
    capturedLogger,
  );
  assert.equal(syncResult.status, 'sharing_error');
  const output = getOutput();

  await execa('git', ['clean', '-fdx'], { cwd: courseRepo.courseLiveDir });
  await execa('git', ['reset', '--hard', 'HEAD'], { cwd: courseRepo.courseLiveDir });

  syncResult = await syncFromDisk.syncOrCreateDiskToSql(courseRepo.courseLiveDir, logger);
  assert.equal(syncResult.status, 'complete');
  assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);

  return output;
}

async function pullAndSyncSharingCourse(course: Course) {
  const { jobSequenceId } = await pullAndUpdateCourse({
    course,
    userId: null,
    authnUserId: null,
  });
  const jobSequence = await helperServer.waitForJobSequence(jobSequenceId);
  return jobSequence.status;
}

describe('Question Sharing', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    await features.enable('question-sharing');
  });

  // Rather than using the example course and test course, we'll set up two courses
  // from scratch. This is necessary because the example course has hardcoded behavior
  // to prevent all question sharing features from working.
  let sharingCourse: Course;
  let consumingCourse: Course;
  let sharingCourseInstanceId: string;
  let consumingCourseInstanceId: string;
  let sharingCourseData: syncUtil.CourseData;

  beforeAll(async () => {
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
      [UNUSED_SHARING_SET_QUESTION_QID]: {
        uuid: '66666666-6666-6666-6666-666666666666',
        type: 'v3',
        title: 'In a sharing set but unused',
        topic: 'TOPIC HERE',
      },
      [PUBLICLY_SHARED_QUESTION_QID]: {
        uuid: '11111111-1111-1111-1111-111111111111',
        type: 'v3',
        title: 'Shared publicly',
        topic: 'TOPIC HERE',
      },
      [UNUSED_PUBLICLY_SHARED_QUESTION_QID]: {
        uuid: '33333333-3333-3333-3333-333333333333',
        type: 'v3',
        title: 'Shared publicly but unused',
        topic: 'TOPIC HERE',
      },
      [UNUSED_RENAMEABLE_QUESTION_QID]: {
        uuid: '55555555-5555-5555-5555-555555555555',
        type: 'v3',
        title: 'Shared publicly but unused, for rename test',
        topic: 'TOPIC HERE',
      },
      [ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID]: {
        uuid: '44444444-4444-4444-4444-444444444444',
        type: 'v3',
        title: 'Used only in a publicly shared assessment',
        topic: 'TOPIC HERE',
      },
      [DRAFT_QUESTION_QID]: {
        uuid: '22222222-2222-2222-2222-222222222222',
        type: 'v3',
        title: 'Draft question',
        topic: 'TOPIC HERE',
      },
    };

    courseRepo = await createCourseRepoFixture({
      populateOrigin: async (originDir) => {
        await syncUtil.writeCourseToDirectory(sharingCourseData, originDir);

        // Fill in empty `question.html` files for our two questions so that we can
        // view them without errors. We don't actually need any contents.
        await fs.writeFile(
          path.join(originDir, 'questions', SHARING_QUESTION_QID, 'question.html'),
          '',
        );
        await fs.writeFile(
          path.join(originDir, 'questions', UNUSED_SHARING_SET_QUESTION_QID, 'question.html'),
          '',
        );
        await fs.writeFile(
          path.join(originDir, 'questions', PUBLICLY_SHARED_QUESTION_QID, 'question.html'),
          '',
        );
        await fs.writeFile(
          path.join(originDir, 'questions', UNUSED_PUBLICLY_SHARED_QUESTION_QID, 'question.html'),
          '',
        );
        await fs.writeFile(
          path.join(originDir, 'questions', UNUSED_RENAMEABLE_QUESTION_QID, 'question.html'),
          '',
        );
        await fs.writeFile(
          path.join(
            originDir,
            'questions',
            ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
            'question.html',
          ),
          '',
        );
      },
    });
    const syncResults = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
    await updateCourseRepository({
      courseId: syncResults.courseId,
      repository: courseRepo.courseOriginDir,
    });
    sharingCourse = await selectCourseById(syncResults.courseId);
    sharingCourseInstanceId = (
      await selectCourseInstanceByShortName({
        course: sharingCourse,
        shortName: syncUtil.COURSE_INSTANCE_ID,
      })
    ).id;

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
    consumingCourseInstanceId = (
      await selectCourseInstanceByShortName({
        course: consumingCourse,
        shortName: syncUtil.COURSE_INSTANCE_ID,
      })
    ).id;
  });

  describe('Test syncing code to identify missing shared question', function () {
    beforeAll(() => {
      config.checkSharingOnSync = true;
    });
    afterAll(() => {
      config.checkSharingOnSync = false;
    });

    test.sequential('Fail to sync course when validating shared question paths', async () => {
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings) {
        throw new Error(
          'Sync of consuming course succeeded when it should have failed due to unresolved shared question path.',
        );
      }
    });
  });

  describe('Create a sharing set and add a question to it', () => {
    let exampleCourseSharingToken: string | null;
    let testCourseSharingToken: string | null;

    test.sequential(
      'Sync course with sharing enabled, disabling validating shared question paths',
      async () => {
        const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
        if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
          throw new Error('Errors or warnings found during sync of consuming course');
        }
      },
    );

    test.sequential(
      'Fail to access shared question, because permission has not yet been granted',
      async () => {
        // Since permissions aren't yet granted, the shared question doesn't show up on the assessment page
        const res = await accessSharedQuestionAssessment(consumingCourseInstanceId);
        assert(!(await res.text()).includes(SHARING_QUESTION_QID));

        // Question can be accessed through the owning course
        const questionId = (
          await selectQuestionByQid({
            course_id: sharingCourse.id,
            qid: SHARING_QUESTION_QID,
          })
        ).id;
        const sharedQuestionUrl = `${baseUrl}/course/${sharingCourse.id}/question/${questionId}`;
        const sharedQuestionPage = await fetchCheerio(sharedQuestionUrl);
        assert(sharedQuestionPage.ok);

        // Question cannot be accessed through the consuming course, sharing permissions not yet set
        const sharedQuestionSharedUrl = `${baseUrl}/course/${consumingCourse.id}/question/${questionId}/settings`;
        const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
        assert(!sharedQuestionSharedPage.ok);
      },
    );

    test.sequential('Fail if trying to set an invalid sharing name', async () => {
      await expect(setSharingName(sharingCourse.id, 'invalid@sharingname')).rejects.toThrow();
      await expect(setSharingName(sharingCourse.id, 'invalid / sharingname')).rejects.toThrow();
      await expect(setSharingName(sharingCourse.id, '')).rejects.toThrow();
    });

    test.sequential('Set consuming course sharing name', async () => {
      await setSharingName(consumingCourse.id, CONSUMING_COURSE_SHARING_NAME);
      const sharingPage = await fetchCheerio(sharingPageUrl(consumingCourse.id));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        CONSUMING_COURSE_SHARING_NAME,
      );
    });

    test.sequential('Set sharing course sharing name', async () => {
      await setSharingName(sharingCourse.id, SHARING_COURSE_SHARING_NAME);
      const sharingPage = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      assert(sharingPage.ok);
      assert.include(
        sharingPage.$('[data-testid="sharing-name"]').text(),
        SHARING_COURSE_SHARING_NAME,
      );
    });

    test.sequential(
      'Successfully change the sharing name when no questions have been shared',
      async () => {
        await setSharingName(sharingCourse.id, 'Nothing shared yet');
        await setSharingName(sharingCourse.id, SHARING_COURSE_SHARING_NAME);
      },
    );

    test.sequential('Generate and get sharing token for sharing course', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      await client.sharing.regenerateSharingToken.mutate();

      const response = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      const result = UUID_REGEXP.exec(await response.text());
      exampleCourseSharingToken = result ? result[0] : null;
      assert(exampleCourseSharingToken != null);
    });

    test.sequential('Get default sharing token for consuming course', async () => {
      const sharingUrl = sharingPageUrl(consumingCourse.id);
      const response = await fetchCheerio(sharingUrl);
      const result = UUID_REGEXP.exec(await response.text());
      testCourseSharingToken = result ? result[0] : null;
      assert(testCourseSharingToken != null);
    });

    test.sequential('Add sharing set to JSON', async () => {
      sharingCourseData.course.sharingSets = [
        { name: SHARING_SET_NAME, description: 'Sharing set for testing' },
      ];
      const courseInfoPath = path.join(courseRepo.courseOriginDir, 'infoCourse.json');
      await fs.writeJSON(courseInfoPath, sharingCourseData.course);

      sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [SHARING_SET_NAME];
      await fs.writeJSON(
        path.join(courseRepo.courseOriginDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
        sharingCourseData.questions[SHARING_QUESTION_QID],
      );

      await commitOriginAndSync(courseRepo, 'Add sharing set');
    });

    test.sequential('Share sharing set with test course', async () => {
      const sharingSet = await selectOptionalSharingSetByName({
        course_id: sharingCourse.id,
        name: SHARING_SET_NAME,
      });
      assert.isNotNull(sharingSet);
      const client = await sharingTrpcClient(sharingCourse.id);
      await client.sharing.addCourseToSharingSet.mutate({
        sharingSetId: sharingSet.id,
        courseSharingToken: testCourseSharingToken!,
      });

      const sharingPage = await fetchCheerio(sharingPageUrl(sharingCourse.id));
      assert(sharingPage.ok);
      assert.include(sharingPage.$('[data-testid="shared-with"]').text(), 'CONSUMING 101');
    });

    test.sequential('Attempt to share sharing set with invalid course token', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      await expect(
        client.sharing.addCourseToSharingSet.mutate({
          sharingSetId: '1',
          courseSharingToken: 'invalid sharing token',
        }),
      ).rejects.toThrow();
    });

    test.sequential('Attempt to share sharing set with own course', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      await expect(
        client.sharing.addCourseToSharingSet.mutate({
          sharingSetId: '1',
          courseSharingToken: exampleCourseSharingToken!,
        }),
      ).rejects.toThrow();
    });

    test.sequential('Attempt to share sharing set that does not belong to the course', async () => {
      const client = await sharingTrpcClient(consumingCourse.id);
      await expect(
        client.sharing.addCourseToSharingSet.mutate({
          sharingSetId: '1',
          courseSharingToken: exampleCourseSharingToken!,
        }),
      ).rejects.toThrow();
    });

    test.sequential('Fail to change the sharing name when a question has been shared', async () => {
      await expect(setSharingName(sharingCourse.id, 'Question shared')).rejects.toThrow();
    });
  });

  describe('Test Sharing a Question Publicly', function () {
    let publiclySharedQuestionId: string;

    beforeAll(async () => {
      publiclySharedQuestionId = (
        await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: PUBLICLY_SHARED_QUESTION_QID,
        })
      ).id;
    });

    test.sequential('Fail to Access Questions Not-yet shared publicly', async () => {
      const sharedQuestionSharedUrl = `${baseUrl}/course/${consumingCourse.id}/question/${publiclySharedQuestionId}`;
      const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
      assert(!sharedQuestionSharedPage.ok);
    });

    test.sequential('Publicly share a question', async () => {
      sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID].sharePublicly = true;
      await fs.writeJSON(
        path.join(
          courseRepo.courseOriginDir,
          'questions',
          PUBLICLY_SHARED_QUESTION_QID,
          'info.json',
        ),
        sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID],
      );

      sharingCourseData.questions[UNUSED_PUBLICLY_SHARED_QUESTION_QID].sharePublicly = true;
      await fs.writeJSON(
        path.join(
          courseRepo.courseOriginDir,
          'questions',
          UNUSED_PUBLICLY_SHARED_QUESTION_QID,
          'info.json',
        ),
        sharingCourseData.questions[UNUSED_PUBLICLY_SHARED_QUESTION_QID],
      );

      sharingCourseData.questions[UNUSED_RENAMEABLE_QUESTION_QID].sharePublicly = true;
      await fs.writeJSON(
        path.join(
          courseRepo.courseOriginDir,
          'questions',
          UNUSED_RENAMEABLE_QUESTION_QID,
          'info.json',
        ),
        sharingCourseData.questions[UNUSED_RENAMEABLE_QUESTION_QID],
      );

      sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID].sharePublicly =
        true;
      await fs.writeJSON(
        path.join(
          courseRepo.courseOriginDir,
          'questions',
          ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
          'info.json',
        ),
        sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID],
      );

      await commitAndPullSharingCourse();
    });

    test.sequential(
      'Successfully access publicly shared question through other course',
      async () => {
        const sharedQuestionSharedUrl = `${baseUrl}/course/${consumingCourse.id}/question/${publiclySharedQuestionId}`;
        const sharedQuestionSharedPage = await fetchCheerio(sharedQuestionSharedUrl);
        assert(sharedQuestionSharedPage.ok);
      },
    );
  });

  describe('Test syncing code succeeding once questions have been shared', function () {
    beforeAll(() => {
      config.checkSharingOnSync = true;
    });
    afterAll(() => {
      config.checkSharingOnSync = false;
    });
    test.sequential('Re-sync test course, validating shared questions', async () => {
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
      if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
        throw new Error('Errors or warnings found during sync of consuming course');
      }
    });

    test.sequential('Successfully access shared question', async () => {
      const res = await accessSharedQuestionAssessment(consumingCourseInstanceId);
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

    test.sequential('Fail to sync if shared question is renamed', async () => {
      const questionPath = path.join(sharingCourse.path, 'questions', SHARING_QUESTION_QID);
      const questionTempPath = questionPath + '_temp';
      await fs.rename(questionPath, questionTempPath);
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(sharingCourse.path, logger);
      assert.equal(
        syncResult.status,
        'sharing_error',
        'sync should not complete when attempting sync after moving shared question',
      );

      await selectQuestionByQid({
        course_id: sharingCourse.id,
        qid: SHARING_QUESTION_QID,
      });
      await fs.rename(questionTempPath, questionPath);
    });

    test.sequential('Rename shared question in origin, ensure live does not sync it', async () => {
      // Ensure that we can sync before renaming.
      const initialSyncStatus = await pullAndSyncSharingCourse(sharingCourse);
      assert.equal(initialSyncStatus, 'Success');

      const questionPath = path.join(courseRepo.courseOriginDir, 'questions', SHARING_QUESTION_QID);
      const questionTempPath = questionPath + '_temp';
      await fs.rename(questionPath, questionTempPath);
      await execa('git', ['add', '-A'], { cwd: courseRepo.courseOriginDir });
      await execa('git', ['commit', '-m', 'invalid sharing config edit'], {
        cwd: courseRepo.courseOriginDir,
      });

      const commitHash = await getCourseCommitHash(courseRepo.courseLiveDir);

      const renameSyncStatus = await pullAndSyncSharingCourse(sharingCourse);
      assert.equal(renameSyncStatus, 'Error');

      assert.equal(
        commitHash,
        await getCourseCommitHash(courseRepo.courseLiveDir),
        'Commit hash of sharing course should not change when attempting to sync breaking change.',
      );

      const sharedQuestionExists = await fs.pathExists(
        path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID),
      );
      assert(
        sharedQuestionExists,
        'When origin repo moves shared question, live should not sync that change.',
      );

      // remove breaking change in origin repo
      await execa('git', ['reset', '--hard', 'HEAD~1'], { cwd: courseRepo.courseOriginDir });

      const finalSyncStatus = await pullAndSyncSharingCourse(sharingCourse);
      assert.equal(finalSyncStatus, 'Success');
    });

    test.sequential(
      'Remove a used question from a sharing set, ensure sync error message identifies it',
      async () => {
        const saveSharingSets = sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets!;
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        const output = await ensureInvalidSharingOperationFailsToSync();
        assert.match(
          output,
          /following questions cannot be removed from these sharing sets because at least one consuming course/,
        );
        assert.match(output, new RegExp(`- ${SHARING_QUESTION_QID}: ${SHARING_SET_NAME}`));

        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = saveSharingSets;
      },
    );

    test.sequential(
      'Remove a publicly shared question from a sharing set used by a consuming course, ensure sync still fails',
      async () => {
        // Pins the decision in `checkInvalidSharingSetRemovals` to ignore
        // `share_publicly`. Update this test if we loosen that rule.
        const saveSharingSets = sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets!;
        sharingCourseData.questions[SHARING_QUESTION_QID].sharePublicly = true;
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        const output = await ensureInvalidSharingOperationFailsToSync();
        assert.match(output, new RegExp(`- ${SHARING_QUESTION_QID}: ${SHARING_SET_NAME}`));

        delete sharingCourseData.questions[SHARING_QUESTION_QID].sharePublicly;
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = saveSharingSets;
      },
    );

    test.sequential(
      'Remove a question from a sharing set with no consumers, even when the question is consumed via another set',
      async () => {
        const saveCourseSharingSets = sharingCourseData.course.sharingSets!;
        const saveQuestionSharingSets =
          sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets!;

        sharingCourseData.course.sharingSets = [
          ...saveCourseSharingSets,
          { name: UNGRANTED_SHARING_SET_NAME, description: 'not shared with any course' },
        ];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'infoCourse.json'),
          sharingCourseData.course,
        );

        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [
          SHARING_SET_NAME,
          UNGRANTED_SHARING_SET_NAME,
        ];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        let syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const addedSharingSetQuestionId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set_question,
          {
            sharing_set_name: UNGRANTED_SHARING_SET_NAME,
            qid: SHARING_QUESTION_QID,
            course_id: sharingCourse.id,
          },
          IdSchema,
        );
        assert.isNotNull(addedSharingSetQuestionId);

        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [SHARING_SET_NAME];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const removedSharingSetQuestionId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set_question,
          {
            sharing_set_name: UNGRANTED_SHARING_SET_NAME,
            qid: SHARING_QUESTION_QID,
            course_id: sharingCourse.id,
          },
          IdSchema,
        );
        assert.isNull(removedSharingSetQuestionId);
        const grantedSharingSetQuestionId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set_question,
          {
            sharing_set_name: SHARING_SET_NAME,
            qid: SHARING_QUESTION_QID,
            course_id: sharingCourse.id,
          },
          IdSchema,
        );
        assert.isNotNull(grantedSharingSetQuestionId);

        await execa('git', ['clean', '-fdx'], { cwd: courseRepo.courseLiveDir });
        await execa('git', ['reset', '--hard', 'HEAD'], { cwd: courseRepo.courseLiveDir });
        const restoreSync = await syncFromDisk.syncOrCreateDiskToSql(
          courseRepo.courseLiveDir,
          logger,
        );
        assert.equal(restoreSync.status, 'complete');

        sharingCourseData.course.sharingSets = saveCourseSharingSets;
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = saveQuestionSharingSets;
      },
    );

    test.sequential(
      'Remove an unused question from a sharing set, ensure live syncs and removes it',
      async () => {
        sharingCourseData.questions[UNUSED_SHARING_SET_QUESTION_QID].sharingSets = [
          SHARING_SET_NAME,
        ];
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            UNUSED_SHARING_SET_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[UNUSED_SHARING_SET_QUESTION_QID],
        );

        let syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const createdSharingSetQuestionId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set_question,
          {
            sharing_set_name: SHARING_SET_NAME,
            qid: UNUSED_SHARING_SET_QUESTION_QID,
            course_id: sharingCourse.id,
          },
          IdSchema,
        );
        assert.isNotNull(createdSharingSetQuestionId);

        delete sharingCourseData.questions[UNUSED_SHARING_SET_QUESTION_QID].sharingSets;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            UNUSED_SHARING_SET_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[UNUSED_SHARING_SET_QUESTION_QID],
        );

        syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const remainingSharingSetQuestionId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set_question,
          {
            sharing_set_name: SHARING_SET_NAME,
            qid: UNUSED_SHARING_SET_QUESTION_QID,
            course_id: sharingCourse.id,
          },
          IdSchema,
        );
        assert.isNull(remainingSharingSetQuestionId);

        await execa('git', ['clean', '-fdx'], { cwd: courseRepo.courseLiveDir });
        await execa('git', ['reset', '--hard', 'HEAD'], { cwd: courseRepo.courseLiveDir });
      },
    );

    test.sequential(
      'Unshare a publicly shared question, ensure live does not sync it',
      async () => {
        sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID].sharePublicly = false;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            PUBLICLY_SHARED_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[PUBLICLY_SHARED_QUESTION_QID],
        );

        await ensureInvalidSharingOperationFailsToSync();
      },
    );

    test.sequential('Rename a publicly shared question that has no consumers', async () => {
      const originalQuestionPath = path.join(
        courseRepo.courseOriginDir,
        'questions',
        UNUSED_RENAMEABLE_QUESTION_QID,
      );
      const renamedQid = `${UNUSED_RENAMEABLE_QUESTION_QID}-renamed`;
      const renamedQuestionPath = path.join(courseRepo.courseOriginDir, 'questions', renamedQid);
      await fs.rename(originalQuestionPath, renamedQuestionPath);

      await commitAndPullSharingCourse();

      const oldQuestion = await selectOptionalQuestionByQid({
        course_id: sharingCourse.id,
        qid: UNUSED_RENAMEABLE_QUESTION_QID,
      });
      assert.isNull(oldQuestion);

      const renamedQuestion = await selectQuestionByQid({
        course_id: sharingCourse.id,
        qid: renamedQid,
      });
      assert.isTrue(renamedQuestion.share_publicly);
    });

    test.sequential('Unshare a publicly shared question that has no consumers', async () => {
      sharingCourseData.questions[UNUSED_PUBLICLY_SHARED_QUESTION_QID].sharePublicly = false;
      await fs.writeJSON(
        path.join(
          courseRepo.courseOriginDir,
          'questions',
          UNUSED_PUBLICLY_SHARED_QUESTION_QID,
          'info.json',
        ),
        sharingCourseData.questions[UNUSED_PUBLICLY_SHARED_QUESTION_QID],
      );

      await commitAndPullSharingCourse();

      const unusedQuestion = await selectQuestionByQid({
        course_id: sharingCourse.id,
        qid: UNUSED_PUBLICLY_SHARED_QUESTION_QID,
      });
      assert.isNotNull(unusedQuestion);
      assert.isFalse(unusedQuestion.share_publicly);
    });

    test.sequential(
      'Delete a referenced sharing set, ensure sync error message identifies it',
      async () => {
        assert(sharingCourseData.course.sharingSets);
        const saveSharingSets = sharingCourseData.course.sharingSets;
        sharingCourseData.course.sharingSets = saveSharingSets.filter(
          (ss) => ss.name !== SHARING_SET_NAME,
        );
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'infoCourse.json'),
          sharingCourseData.course,
        );

        const { logger: capturedLogger, getOutput } = makeMockLogger();
        const syncResult = await syncFromDisk.syncOrCreateDiskToSql(
          courseRepo.courseLiveDir,
          capturedLogger,
        );
        assert.equal(syncResult.status, 'sharing_error');
        assert.match(
          getOutput(),
          new RegExp(
            `The following sharing sets are still in use and cannot be removed from 'infoCourse\\.json': ${SHARING_SET_NAME}`,
          ),
        );

        await execa('git', ['clean', '-fdx'], { cwd: courseRepo.courseLiveDir });
        await execa('git', ['reset', '--hard', 'HEAD'], { cwd: courseRepo.courseLiveDir });
        const restoreSync = await syncFromDisk.syncOrCreateDiskToSql(
          courseRepo.courseLiveDir,
          logger,
        );
        assert.equal(restoreSync.status, 'complete');

        sharingCourseData.course.sharingSets = saveSharingSets;
      },
    );

    test.sequential(
      'Delete an unreferenced sharing set, ensure live syncs and removes it',
      async () => {
        const newSharingSetName = 'unreferenced-share-set';
        assert(sharingCourseData.course.sharingSets);
        const saveSharingSets = sharingCourseData.course.sharingSets;
        sharingCourseData.course.sharingSets = [
          ...saveSharingSets,
          { name: newSharingSetName, description: 'no references' },
        ];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'infoCourse.json'),
          sharingCourseData.course,
        );

        let syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const createdId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set,
          { sharing_set_name: newSharingSetName },
          IdSchema,
        );
        assert.isNotNull(createdId);

        sharingCourseData.course.sharingSets = saveSharingSets;
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'infoCourse.json'),
          sharingCourseData.course,
        );

        syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const remainingId = await sqldb.queryOptionalScalar(
          sql.select_sharing_set,
          { sharing_set_name: newSharingSetName },
          IdSchema,
        );
        assert.isNull(remainingId);

        await execa('git', ['clean', '-fdx'], { cwd: courseRepo.courseLiveDir });
        await execa('git', ['reset', '--hard', 'HEAD'], { cwd: courseRepo.courseLiveDir });
      },
    );

    test.sequential(
      'Adding question to sharing set that does not exist, ensure sync error is created',
      async () => {
        const saveSharingSets = sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets || [];
        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = [
          ...saveSharingSets,
          'Fake Sharing Set Name',
        ];
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const question = await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: SHARING_QUESTION_QID,
        });
        assert.isNotNull(question);
        assert.isNotNull(question.sync_errors);
        assert.match(question.sync_errors, /Fake Sharing Set Name/);

        sharingCourseData.questions[SHARING_QUESTION_QID].sharingSets = saveSharingSets;
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'questions', SHARING_QUESTION_QID, 'info.json'),
          sharingCourseData.questions[SHARING_QUESTION_QID],
        );
      },
    );
  });

  describe('Test publicly sharing an assessment', { timeout: 80_000 }, function () {
    beforeAll(() => {
      config.checkSharingOnSync = true;
    });
    afterAll(() => {
      config.checkSharingOnSync = false;
    });

    test.sequential(
      'Shared course instance containing a nonshared assessment creates a sync error on course instance',
      async () => {
        sharingCourseData.courseInstances['Fa19'].courseInstance.shareSourcePublicly = true;
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'courseInstances/Fa19/infoCourseInstance.json'),
          sharingCourseData.courseInstances['Fa19'].courseInstance,
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const courseInstance = await selectCourseInstanceByShortName({
          course: sharingCourse,
          shortName: 'Fa19',
        });
        assert.isNotNull(courseInstance);
        assert.isNotNull(courseInstance.sync_errors);
        assert.match(
          courseInstance.sync_errors,
          /contains assessments which are not publicly shared/,
        );

        // Restore for now
        sharingCourseData.courseInstances['Fa19'].courseInstance.shareSourcePublicly = false;
        await fs.writeJSON(
          path.join(courseRepo.courseLiveDir, 'courseInstances/Fa19/infoCourseInstance.json'),
          sharingCourseData.courseInstances['Fa19'].courseInstance,
        );
      },
    );

    test.sequential(
      'Fail to sync a shared assessment containing a nonshared question',
      async () => {
        sharingCourseData.courseInstances['Fa19'].assessments['test'].shareSourcePublicly = true;
        sharingCourseData.courseInstances['Fa19'].assessments['test'].zones = [
          {
            questions: [
              { id: `${SHARING_QUESTION_QID}`, points: 1 },
              { id: `${PUBLICLY_SHARED_QUESTION_QID}`, points: 1 },
            ],
          },
        ];

        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'courseInstances/Fa19/assessments/test/infoAssessment.json',
          ),
          sharingCourseData.courseInstances['Fa19'].assessments['test'],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert(syncResult.status === 'complete');

        const assessment = await selectAssessmentByTid({
          course_instance_id: sharingCourseInstanceId,
          tid: 'test',
        });
        assert.isNotNull(assessment);
        assert.isNotNull(assessment.sync_errors);
        assert.match(assessment.sync_errors, /contains questions which are not publicly shared/);
      },
    );

    test.sequential('Successfully sync a shared assessment with a shared question', async () => {
      sharingCourseData.courseInstances['Fa19'].assessments['test'].zones = [
        {
          questions: [
            { id: `${PUBLICLY_SHARED_QUESTION_QID}`, points: 1 },
            { id: `${ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID}`, points: 1 },
          ],
        },
      ];

      await fs.writeJSON(
        path.join(
          courseRepo.courseLiveDir,
          'courseInstances/Fa19/assessments/test/infoAssessment.json',
        ),
        sharingCourseData.courseInstances['Fa19'].assessments['test'],
      );

      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(sharingCourse.path, logger);
      assert(syncResult.status === 'complete');
      assert.isFalse(syncResult.hadJsonErrorsOrWarnings);
    });

    test.sequential(
      'Fail to unshare a publicly shared question that is in a publicly shared assessment in the same course',
      async () => {
        sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID].sharePublicly =
          false;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'sharing_error');

        sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID].sharePublicly =
          true;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID],
        );
      },
    );

    test.sequential(
      'Allow sharing only the source of a question that is in a publicly shared assessment in the same course',
      async () => {
        sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID].sharePublicly =
          false;
        sharingCourseData.questions[
          ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID
        ].shareSourcePublicly = true;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID],
        );

        let syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);

        sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID].sharePublicly =
          true;
        delete sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID]
          .shareSourcePublicly;
        await fs.writeJSON(
          path.join(
            courseRepo.courseLiveDir,
            'questions',
            ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID,
            'info.json',
          ),
          sharingCourseData.questions[ASSESSMENT_ONLY_PUBLICLY_SHARED_QUESTION_QID],
        );

        syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);
      },
    );

    test.sequential('Successfully sync a shared course instance', async () => {
      sharingCourseData.courseInstances['Fa19'].courseInstance.shareSourcePublicly = true;
      await fs.writeJSON(
        path.join(courseRepo.courseLiveDir, 'courseInstances/Fa19/infoCourseInstance.json'),
        sharingCourseData.courseInstances['Fa19'].courseInstance,
      );

      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(sharingCourse.path, logger);
      if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
        throw new Error('Errors or warnings found during sync of sharing course');
      }
    });

    test.sequential(
      'Successfully access publicly shared course instance page for the shared course instance',
      async () => {
        const sharedCourseInstanceUrl = `${baseUrl}/public/course_instance/${sharingCourseInstanceId}/assessments`;
        const sharedCourseInstancePage = await fetchCheerio(sharedCourseInstanceUrl);

        assert(sharedCourseInstancePage.ok);
      },
    );

    test.sequential(
      'Successfully access publicly shared assessment page for the shared assessment',
      async () => {
        const sharedAssessmentId = (
          await selectAssessmentByTid({
            tid: 'test',
            course_instance_id: sharingCourseInstanceId,
          })
        ).id;
        const sharedAssessmentUrl = `${baseUrl}/public/course_instance/${sharingCourseInstanceId}/assessment/${sharedAssessmentId}/questions`;
        const sharedAssessmentPage = await fetchCheerio(sharedAssessmentUrl);

        assert(sharedAssessmentPage.ok);
      },
    );

    test.sequential(
      'Try adding a draft question to a sharing set, ensure sync error is created',
      async () => {
        sharingCourseData.questions[DRAFT_QUESTION_QID].sharingSets = [SHARING_SET_NAME];

        const questionDirectory = path.join(
          courseRepo.courseLiveDir,
          'questions',
          DRAFT_QUESTION_QID,
        );
        await fs.ensureDir(questionDirectory);
        await fs.writeJSON(
          path.join(questionDirectory, 'info.json'),
          sharingCourseData.questions[DRAFT_QUESTION_QID],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const question = await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: DRAFT_QUESTION_QID,
        });
        assert.isNotNull(question);
        assert.isNotNull(question.sync_errors);
        assert.match(question.sync_errors, /cannot be added to sharing sets/);
      },
    );

    test.sequential(
      'Try publicly sharing a draft question, ensure sync error is created',
      async () => {
        delete sharingCourseData.questions[DRAFT_QUESTION_QID].sharingSets;
        sharingCourseData.questions[DRAFT_QUESTION_QID].sharePublicly = true;

        const questionDirectory = path.join(
          courseRepo.courseLiveDir,
          'questions',
          DRAFT_QUESTION_QID,
        );
        await fs.writeJSON(
          path.join(questionDirectory, 'info.json'),
          sharingCourseData.questions[DRAFT_QUESTION_QID],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const question = await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: DRAFT_QUESTION_QID,
        });
        assert.isNotNull(question);
        assert.isNotNull(question.sync_errors);
        assert.match(question.sync_errors, /cannot be publicly shared/);
      },
    );

    test.sequential(
      'Try publicly sharing the source of a draft question, ensure sync error is created',
      async () => {
        delete sharingCourseData.questions[DRAFT_QUESTION_QID].sharePublicly;
        sharingCourseData.questions[DRAFT_QUESTION_QID].shareSourcePublicly = true;

        const questionDirectory = path.join(
          courseRepo.courseLiveDir,
          'questions',
          DRAFT_QUESTION_QID,
        );
        await fs.writeJSON(
          path.join(questionDirectory, 'info.json'),
          sharingCourseData.questions[DRAFT_QUESTION_QID],
        );

        const syncResult = await syncUtil.syncCourseData(courseRepo.courseLiveDir);
        assert.equal(syncResult.status, 'complete');
        const question = await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: DRAFT_QUESTION_QID,
        });
        assert.isNotNull(question);
        assert.isNotNull(question.sync_errors);
        assert.match(question.sync_errors, /cannot be publicly shared/);
      },
    );
  });

  describe('Test that deleted shared questions are excluded from imports', function () {
    // Resolve question IDs once before any soft-deletes; `selectQuestionByQid`
    // filters on `deleted_at IS NULL`, so the lookup would fail mid-test once
    // the question has been soft-deleted.
    let sharingQuestionId: string;
    let publiclySharedQuestionId: string;

    beforeAll(async () => {
      sharingQuestionId = (
        await selectQuestionByQid({ course_id: sharingCourse.id, qid: SHARING_QUESTION_QID })
      ).id;
      publiclySharedQuestionId = (
        await selectQuestionByQid({
          course_id: sharingCourse.id,
          qid: PUBLICLY_SHARED_QUESTION_QID,
        })
      ).id;
    });

    test.sequential(
      'Soft-delete a sharing-set question, ensure consuming course sync reports errors',
      async () => {
        await withConfig({ checkSharingOnSync: true }, async () => {
          await updateQuestion({
            question_id: sharingQuestionId,
            patch: { deleted_at: new Date() },
          });

          const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
          expect(
            syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings,
          ).toBeTruthy();

          await updateQuestion({
            question_id: sharingQuestionId,
            patch: { deleted_at: null },
          });
        });
      },
    );

    test.sequential(
      'Soft-delete a publicly shared question, ensure consuming course sync reports errors',
      async () => {
        await withConfig({ checkSharingOnSync: true }, async () => {
          await updateQuestion({
            question_id: publiclySharedQuestionId,
            patch: { deleted_at: new Date() },
          });

          const syncResult = await syncFromDisk.syncOrCreateDiskToSql(consumingCourse.path, logger);
          expect(
            syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings,
          ).toBeTruthy();

          await updateQuestion({
            question_id: publiclySharedQuestionId,
            patch: { deleted_at: null },
          });
        });
      },
    );
  });

  describe('Sharing admin gates and CRUD via tRPC', function () {
    const CRUD_SET_NAME = 'crud-tmp-set';
    const DELETE_REGRESSION_SET_NAME = 'delete-sync-regression-set';
    const STALE_DELETE_SET_NAME = 'stale-delete-set';
    const STALE_DELETE_BUMP_SET_NAME = 'stale-delete-bump-set';

    async function getInfoCourseOrigHash() {
      const infoCoursePath = path.join(sharingCourse.path, 'infoCourse.json');
      return (await getOriginalHash(infoCoursePath)) ?? '';
    }

    async function selectSharingSet(name: string) {
      return await selectOptionalSharingSetByName({ course_id: sharingCourse.id, name });
    }

    test.sequential('non-owner users cannot mutate sharing state', async () => {
      const viewer = await getOrCreateUser({
        uid: 'sharing-viewer@example.com',
        name: 'Sharing Viewer',
        uin: 'sharing-viewer',
        email: 'sharing-viewer@example.com',
      });
      const owner = await getDevUserId();
      await insertCoursePermissionsByUserUid({
        course_id: sharingCourse.id,
        uid: 'sharing-viewer@example.com',
        course_role: 'Viewer',
        authn_user_id: owner,
      });

      await withUser(viewer, async () => {
        const csrfToken = generatePrefixCsrfToken(
          { url: getCourseTrpcUrl(sharingCourse.id), authn_user_id: viewer.id },
          config.secretKey,
        );
        const client = createCourseTrpcClient({
          csrfToken,
          courseId: sharingCourse.id,
          urlBase: siteUrl,
        });
        try {
          await client.sharing.regenerateSharingToken.mutate();
          assert.fail('Expected mutation to throw');
        } catch (err: unknown) {
          const appError = getAppError<Record<string, never>>(err);
          assert.isNotNull(appError);
          assert.equal(appError.code, 'UNKNOWN');
          assert.include(appError.message, 'Access denied (must be a course owner)');
        }
      });
    });

    test.sequential('sharing mutations fail when question sharing is disabled', async () => {
      await features.disable('question-sharing', {
        institution_id: sharingCourse.institution_id,
        course_id: sharingCourse.id,
      });
      try {
        const client = await sharingTrpcClient(sharingCourse.id);
        try {
          await client.sharing.regenerateSharingToken.mutate();
          assert.fail('Expected mutation to throw');
        } catch (err: unknown) {
          const appError = getAppError<Record<string, never>>(err);
          assert.isNotNull(appError);
          assert.equal(appError.code, 'UNKNOWN');
          assert.include(appError.message, 'Access denied (feature not available)');
        }
      } finally {
        await features.enable('question-sharing', {
          institution_id: sharingCourse.institution_id,
          course_id: sharingCourse.id,
        });
      }
    });

    test.sequential('file-editing mutations fail on example courses', async () => {
      await updateCourseExampleCourse({
        course_id: sharingCourse.id,
        example_course: true,
      });
      try {
        const client = await sharingTrpcClient(sharingCourse.id);
        try {
          await client.sharing.createSharingSet.mutate({
            name: 'example-attempted',
            origHash: await getInfoCourseOrigHash(),
          });
          assert.fail('Expected mutation to throw');
        } catch (err: unknown) {
          const appError = getAppError<Record<string, never>>(err);
          assert.isNotNull(appError);
          assert.equal(appError.code, 'UNKNOWN');
          assert.include(appError.message, 'Access denied. Cannot make changes to example course.');
        }
      } finally {
        await updateCourseExampleCourse({
          course_id: sharingCourse.id,
          example_course: false,
        });
      }
    });

    test.sequential('createSharingSet writes the set to infoCourse.json', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      const result = await client.sharing.createSharingSet.mutate({
        name: CRUD_SET_NAME,
        description: 'CRUD test set',
        origHash: await getInfoCourseOrigHash(),
      });
      assert.ok(result.origHash);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(sharingCourse.path, 'infoCourse.json'), 'utf8'),
      );
      const createdSet = courseInfo.sharingSets.find(
        (s: { name: string }) => s.name === CRUD_SET_NAME,
      );
      assert.ok(createdSet);
      assert.equal(createdSet.description, 'CRUD test set');
    });

    test.sequential('createSharingSet rejects duplicate names with DUPLICATE_NAME', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      try {
        await client.sharing.createSharingSet.mutate({
          name: CRUD_SET_NAME,
          origHash: await getInfoCourseOrigHash(),
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<SharingError['CreateSharingSet']>(err);
        assert.isNotNull(appError);
        assert.equal(appError.code, 'DUPLICATE_NAME');
      }
    });

    test.sequential(
      'updateSharingSetDescription rewrites the description and rejects NOT_FOUND',
      async () => {
        const client = await sharingTrpcClient(sharingCourse.id);

        const result = await client.sharing.updateSharingSetDescription.mutate({
          name: CRUD_SET_NAME,
          description: 'Updated description',
          origHash: await getInfoCourseOrigHash(),
        });
        assert.ok(result.origHash);

        const courseInfo = JSON.parse(
          await fs.readFile(path.join(sharingCourse.path, 'infoCourse.json'), 'utf8'),
        );
        const updatedSet = courseInfo.sharingSets.find(
          (s: { name: string }) => s.name === CRUD_SET_NAME,
        );
        assert.equal(updatedSet.description, 'Updated description');

        try {
          await client.sharing.updateSharingSetDescription.mutate({
            name: 'does-not-exist',
            description: 'anything',
            origHash: await getInfoCourseOrigHash(),
          });
          assert.fail('Expected mutation to throw');
        } catch (err: unknown) {
          const appError = getAppError<SharingError['UpdateSharingSetDescription']>(err);
          assert.isNotNull(appError);
          assert.equal(appError.code, 'NOT_FOUND');
        }
      },
    );

    test.sequential('deleteSharingSet rejects an in-use set with IN_USE', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      try {
        await client.sharing.deleteSharingSet.mutate({
          name: SHARING_SET_NAME,
          origHash: await getInfoCourseOrigHash(),
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<SharingError['DeleteSharingSet']>(err);
        assert.isNotNull(appError);
        assert.equal(appError.code, 'IN_USE');
      }
    });

    test.sequential(
      'deleteSharingSet succeeds when the unused set already exists in the DB',
      async () => {
        const client = await sharingTrpcClient(sharingCourse.id);
        const createResult = await client.sharing.createSharingSet.mutate({
          name: DELETE_REGRESSION_SET_NAME,
          origHash: await getInfoCourseOrigHash(),
        });
        assert.isNotNull(await selectSharingSet(DELETE_REGRESSION_SET_NAME));

        const deleteResult = await client.sharing.deleteSharingSet.mutate({
          name: DELETE_REGRESSION_SET_NAME,
          origHash: createResult.origHash,
        });
        assert.ok(deleteResult.origHash);
        assert.isNull(await selectSharingSet(DELETE_REGRESSION_SET_NAME));

        const courseInfo = JSON.parse(
          await fs.readFile(path.join(sharingCourse.path, 'infoCourse.json'), 'utf8'),
        );
        const sharingSets: { name: string }[] = courseInfo.sharingSets ?? [];
        assert.isUndefined(sharingSets.find((s) => s.name === DELETE_REGRESSION_SET_NAME));
      },
    );

    test.sequential('deleteSharingSet with a stale hash leaves the DB row intact', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      const createResult = await client.sharing.createSharingSet.mutate({
        name: STALE_DELETE_SET_NAME,
        origHash: await getInfoCourseOrigHash(),
      });
      assert.isNotNull(await selectSharingSet(STALE_DELETE_SET_NAME));

      await client.sharing.createSharingSet.mutate({
        name: STALE_DELETE_BUMP_SET_NAME,
        origHash: createResult.origHash,
      });

      try {
        await client.sharing.deleteSharingSet.mutate({
          name: STALE_DELETE_SET_NAME,
          origHash: createResult.origHash,
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<SharingError['DeleteSharingSet']>(err);
        assert.isNotNull(appError);
        assert.equal(appError.code, 'SYNC_JOB_FAILED');
      }

      assert.isNotNull(await selectSharingSet(STALE_DELETE_SET_NAME));
      const courseInfo = JSON.parse(
        await fs.readFile(path.join(sharingCourse.path, 'infoCourse.json'), 'utf8'),
      );
      const sharingSets: { name: string }[] = courseInfo.sharingSets ?? [];
      assert.ok(sharingSets.find((s) => s.name === STALE_DELETE_SET_NAME));

      const cleanupResult = await client.sharing.deleteSharingSet.mutate({
        name: STALE_DELETE_SET_NAME,
        origHash: await getInfoCourseOrigHash(),
      });
      await client.sharing.deleteSharingSet.mutate({
        name: STALE_DELETE_BUMP_SET_NAME,
        origHash: cleanupResult.origHash,
      });
    });

    test.sequential('deleteSharingSet removes an unused set from infoCourse.json', async () => {
      const client = await sharingTrpcClient(sharingCourse.id);
      const result = await client.sharing.deleteSharingSet.mutate({
        name: CRUD_SET_NAME,
        origHash: await getInfoCourseOrigHash(),
      });
      assert.ok(result.origHash);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(sharingCourse.path, 'infoCourse.json'), 'utf8'),
      );
      const sharingSets: { name: string }[] = courseInfo.sharingSets ?? [];
      assert.isUndefined(sharingSets.find((s) => s.name === CRUD_SET_NAME));
    });
  });
});
