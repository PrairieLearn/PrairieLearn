import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { AssessmentSchema } from '../lib/db-types.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { type AssessmentJsonInput } from '../schemas/infoAssessment.js';
import { settingsScope } from '../trpc/assessment/assessment-settings.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { syncCourseData } from './sync/util.js';
import { getConfiguredUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const siteUrl = `http://localhost:${config.serverPort}`;
const assessmentRelPath = 'courseInstances/Fa18/assessments/HW1/infoAssessment.json';

let courseRepo: CourseRepoFixture;
let assessmentId: string;

function liveInfoPath() {
  return path.join(courseRepo.courseLiveDir, assessmentRelPath);
}

async function setupAssessmentInfo(content: AssessmentJsonInput) {
  await fs.writeFile(liveInfoPath(), JSON.stringify(content, null, 2));
  // Commit the new state in the live tree and push to origin so the working
  // tree is clean and the editor's subsequent push succeeds.
  await execa('git', ['add', assessmentRelPath], { cwd: courseRepo.courseLiveDir });
  const stagedDiff = await execa('git', ['diff', '--cached', '--quiet'], {
    cwd: courseRepo.courseLiveDir,
    reject: false,
  });
  if (stagedDiff.exitCode !== 0) {
    await execa('git', ['commit', '-m', `test setup: ${content.type}`], {
      cwd: courseRepo.courseLiveDir,
    });
    await execa('git', ['push'], { cwd: courseRepo.courseLiveDir });
  }
  const syncResult = await syncCourseData(courseRepo.courseLiveDir);
  assert(syncResult.status === 'complete' && !syncResult.hadJsonErrorsOrWarnings);
}

async function readLiveInfo(): Promise<AssessmentJsonInput> {
  return await fs.readJson(liveInfoPath());
}

async function getOrigHash() {
  return (await computeScopedJsonHash<AssessmentJsonInput>(liveInfoPath(), settingsScope)) ?? '';
}

async function createTrpcClient() {
  const user = await getConfiguredUser();
  const trpcPath = getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId });
  const csrfToken = generatePrefixCsrfToken(
    { url: trpcPath, authn_user_id: user.id },
    config.secretKey,
  );
  return createAssessmentTrpcClient({
    csrfToken,
    courseInstanceId: '1',
    assessmentId,
    urlBase: siteUrl,
  });
}

const baseUuid = 'c2f20e45-0449-46c6-9418-b65a734870bd';
const baseQuestion = { id: 'test/question' };

describe('Changing assessment type', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid: 'HW1' });
    assessmentId = assessment.id;
  });

  afterAll(async () => {
    await helperServer.after();
  });

  describe('Homework → Exam', () => {
    test('strips Homework-only fields and updates type in DB', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        constantQuestionValue: true,
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 5, maxAutoPoints: 15 }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      assert.equal(result.assessment.type, 'Exam');
      assert.isFalse(result.assessment.show_question_titles);
      const info = await readLiveInfo();
      assert.equal(info.type, 'Exam');
      assert.notProperty(info, 'showQuestionTitles');
      assert.notProperty(info, 'constantQuestionValue');
      const question = info.zones?.[0].questions[0];
      assert.notProperty(question, 'maxAutoPoints');
      assert.notProperty(question, 'maxPoints');
      assert.equal(question?.autoPoints, 5);

      const dbAssessment = await queryRow(
        sql.select_assessment_by_id,
        { id: assessmentId },
        AssessmentSchema,
      );
      assert.equal(dbAssessment.type, 'Exam');
      assert.isFalse(dbAssessment.show_question_titles);
    });

    test.sequential('preserves explicit title visibility when converting to Exam', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        showQuestionTitles: true,
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 5 }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      assert.isTrue(result.assessment.show_question_titles);
      const info = await readLiveInfo();
      assert.isTrue(info.showQuestionTitles);
    });

    test('strips maxAutoPoints from alternatives', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [
          {
            questions: [
              {
                alternatives: [{ id: 'test/question', autoPoints: 5, maxAutoPoints: 20 }],
              },
            ],
          },
        ],
      });

      const trpcClient = await createTrpcClient();
      await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      const info = await readLiveInfo();
      const alternative = info.zones?.[0].questions[0].alternatives?.[0];
      assert.notProperty(alternative, 'maxAutoPoints');
      assert.equal(alternative?.autoPoints, 5);
    });

    test('strips maxPoints from questions', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ id: 'test/question', points: 5, maxPoints: 25 }] }],
      });

      const trpcClient = await createTrpcClient();
      await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      const info = await readLiveInfo();
      assert.notProperty(info.zones?.[0].questions[0], 'maxPoints');
    });
  });

  describe('Exam → Homework', () => {
    test('strips Exam-only top-level fields and updates type in DB', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        multipleInstance: true,
        autoClose: false,
        requireHonorCode: true,
        honorCode: 'Pledge',
        advanceScorePerc: 75,
        allowRealTimeGrading: false,
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10, allowRealTimeGrading: false }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      assert.equal(result.assessment.type, 'Homework');
      assert.isTrue(result.assessment.show_question_titles);
      const info = await readLiveInfo();
      assert.equal(info.type, 'Homework');
      assert.notProperty(info, 'showQuestionTitles');
      assert.notProperty(info, 'multipleInstance');
      assert.notProperty(info, 'autoClose');
      assert.notProperty(info, 'requireHonorCode');
      assert.notProperty(info, 'honorCode');
      assert.notProperty(info, 'advanceScorePerc');
      assert.notProperty(info, 'allowRealTimeGrading');

      const dbAssessment = await queryRow(
        sql.select_assessment_by_id,
        { id: assessmentId },
        AssessmentSchema,
      );
      assert.equal(dbAssessment.type, 'Homework');
      assert.isTrue(dbAssessment.show_question_titles);
    });

    test.sequential('preserves explicit hidden titles when converting to Homework', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        showQuestionTitles: false,
        zones: [{ questions: [{ ...baseQuestion, autoPoints: [5] }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      assert.isFalse(result.assessment.show_question_titles);
      const info = await readLiveInfo();
      assert.isFalse(info.showQuestionTitles);
    });

    test('strips allowRealTimeGrading from nested levels', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        allowRealTimeGrading: false,
        zones: [
          {
            allowRealTimeGrading: false,
            questions: [
              {
                allowRealTimeGrading: true,
                alternatives: [{ id: 'test/question', autoPoints: 5, allowRealTimeGrading: false }],
              },
            ],
          },
        ],
      });

      const trpcClient = await createTrpcClient();
      await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      const info = await readLiveInfo();
      assert.notProperty(info, 'allowRealTimeGrading');
      const zone = info.zones?.[0];
      assert.notProperty(zone, 'allowRealTimeGrading');
      const question = zone?.questions[0];
      assert.notProperty(question, 'allowRealTimeGrading');
      assert.notProperty(question?.alternatives?.[0], 'allowRealTimeGrading');
    });

    test('collapses autoPoints array to first element', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        zones: [{ questions: [{ id: 'test/question', autoPoints: [10, 7, 5] }] }],
      });

      const trpcClient = await createTrpcClient();
      await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      const info = await readLiveInfo();
      assert.equal(info.zones?.[0].questions[0].autoPoints, 10);
    });

    test('collapses points array on alternatives to first element', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        zones: [
          {
            questions: [{ alternatives: [{ id: 'test/question', points: [8, 4, 2] }] }],
          },
        ],
      });

      const trpcClient = await createTrpcClient();
      await trpcClient.assessmentSettings.changeAssessmentType.mutate({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      const info = await readLiveInfo();
      assert.equal(info.zones?.[0].questions[0].alternatives?.[0].points, 8);
    });
  });

  describe('Guards', () => {
    test('rejects when newType matches currentType', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10 }] }],
      });

      const trpcClient = await createTrpcClient();
      await expect(
        trpcClient.assessmentSettings.changeAssessmentType.mutate({
          newType: 'Homework',
          origHash: await getOrigHash(),
        }),
      ).rejects.toThrow(/matches the current type/);
    });

    test('rejects when student instances exist', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10 }] }],
      });

      const devUser = await getConfiguredUser();
      await execute(sql.insert_dummy_instance, {
        assessment_id: assessmentId,
        user_id: devUser.id,
      });

      const trpcClient = await createTrpcClient();
      try {
        await expect(
          trpcClient.assessmentSettings.changeAssessmentType.mutate({
            newType: 'Exam',
            origHash: await getOrigHash(),
          }),
        ).rejects.toThrow(/student instances already exist/);
      } finally {
        await execute(sql.delete_dummy_instances, { assessment_id: assessmentId });
      }
    });

    test('rejects with CONFLICT when origHash is stale', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10 }] }],
      });

      const staleOrigHash = await getOrigHash();
      // Modify a scoped field so the live hash diverges from the stale one.
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test (modified)',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10 }] }],
      });

      const trpcClient = await createTrpcClient();
      await expect(
        trpcClient.assessmentSettings.changeAssessmentType.mutate({
          newType: 'Exam',
          origHash: staleOrigHash,
        }),
      ).rejects.toThrow(/modified since you loaded/);
    });
  });

  describe('analyzeTypeChange', () => {
    test('reports HW→Exam blockers and single-attempt promotions', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        constantQuestionValue: true,
        zones: [{ questions: [{ id: 'test/question', autoPoints: 5, maxAutoPoints: 15 }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.analyzeTypeChange.query({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      const fields = result.blockers.map((b) => b.field);
      assert.includeMembers(fields, ['constantQuestionValue', 'maxAutoPoints']);
      assert.lengthOf(result.pointsListCollapses, 0);
      assert.lengthOf(result.pointsListPromotions, 1);
      assert.equal(result.pointsListPromotions[0].field, 'autoPoints');
      assert.equal(result.pointsListPromotions[0].currentValue, 5);
      assert.deepEqual(result.pointsListPromotions[0].newValue, [5]);
    });

    test('reports Exam→HW blockers and array collapses', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Exam',
        title: 'Type-change test',
        set: 'Exam',
        number: '1',
        multipleInstance: true,
        autoClose: false,
        requireHonorCode: true,
        honorCode: 'Pledge',
        advanceScorePerc: 75,
        allowRealTimeGrading: false,
        // The question overrides real-time grading so the array is valid;
        // the analyzer should still flag the assessment-level rtg blocker
        // and the question's array as a collapse.
        zones: [
          {
            questions: [
              { id: 'test/question', autoPoints: [10, 7, 5], allowRealTimeGrading: true },
            ],
          },
        ],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.analyzeTypeChange.query({
        newType: 'Homework',
        origHash: await getOrigHash(),
      });

      const fields = result.blockers.map((b) => b.field);
      assert.includeMembers(fields, [
        'multipleInstance',
        'autoClose',
        'requireHonorCode',
        'honorCode',
        'advanceScorePerc',
        'allowRealTimeGrading',
      ]);
      assert.lengthOf(result.pointsListCollapses, 1);
      assert.equal(result.pointsListCollapses[0].field, 'autoPoints');
      assert.deepEqual(result.pointsListCollapses[0].currentValue, [10, 7, 5]);
      assert.equal(result.pointsListCollapses[0].newValue, 10);
      assert.lengthOf(result.pointsListPromotions, 0);
    });

    test('reports no blockers and no collapses for a clean HW assessment', async () => {
      await setupAssessmentInfo({
        uuid: baseUuid,
        type: 'Homework',
        title: 'Type-change test',
        set: 'Homework',
        number: '1',
        zones: [{ questions: [{ ...baseQuestion, autoPoints: 10 }] }],
      });

      const trpcClient = await createTrpcClient();
      const result = await trpcClient.assessmentSettings.analyzeTypeChange.query({
        newType: 'Exam',
        origHash: await getOrigHash(),
      });

      assert.lengthOf(result.blockers, 0);
      assert.lengthOf(result.pointsListCollapses, 0);
      // Single-value autoPoints always shows up as a promotion when going to Exam.
      assert.lengthOf(result.pointsListPromotions, 1);
    });
  });
});
