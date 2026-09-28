import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { updateCourseQuestionsReceiveUserData, updateCourseSharingName } from '../models/course.js';

import {
  testElementClientFiles,
  testFileDownloads,
  testQuestionPreviews,
} from './helperQuestionPreview.js';
import * as helperServer from './helperServer.js';
import * as syncUtil from './sync/util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const addNumbers = {
  id: '',
  qid: 'addNumbers',
  type: 'Freeform',
  title: 'Add two numbers',
};
const addVectors = {
  id: '',
  qid: 'addVectors',
  type: 'Calculation',
  title: 'Addition of vectors in Cartesian coordinates',
};
const downloadFile = {
  id: '',
  qid: 'downloadFile',
  type: 'Freeform',
  title: 'File download example question',
};
const customElement = {
  id: '',
  qid: 'customElement',
  type: 'Freeform',
  title: 'Demo: Custom element',
};
const testQuestions = [addNumbers, addVectors, downloadFile, customElement];

function testSharedQuestionStatistics(
  previewPageInfo: { siteUrl: string; questionBaseUrl: string },
  question: { id: string; qid: string },
) {
  describe(`Question statistics for ${question.qid}`, () => {
    it('shows the Statistics tab', async () => {
      const statsUrl = `${previewPageInfo.questionBaseUrl}/${question.id}/statistics`;
      const res = await fetch(`${previewPageInfo.questionBaseUrl}/${question.id}/preview`);
      assert.equal(res.status, 200);
      const page = await res.text();
      assert.include(page, `${new URL(statsUrl).pathname}`);
    });

    it('loads the statistics page and CSV download', async () => {
      const statsUrl = `${previewPageInfo.questionBaseUrl}/${question.id}/statistics`;
      const res = await fetch(statsUrl);
      assert.equal(res.status, 200);
      const page = await res.text();
      assert.include(page, `Detailed assessment statistics for question ${question.qid}`);

      const $ = cheerio.load(page);
      const downloadHref = $('a[href$="stats.csv"]').attr('href');
      assert.isString(downloadHref);

      const csvRes = await fetch(`${previewPageInfo.siteUrl}${downloadHref}`);
      assert.equal(csvRes.status, 200);
      const csvRows = csvParse(await csvRes.text(), {
        columns: true,
      }) as unknown as Record<string, string>[];
      assert.lengthOf(csvRows, 1);

      assert.include(page, 'CONSUMING 101');
      assert.include(page, '91.2');
      assert.notInclude(page, 'QA 101');
      assert.notInclude(page, '12.3');

      assert.equal(csvRows[0].Course, 'CONSUMING 101');
      assert.equal(csvRows[0].Instance, syncUtil.COURSE_INSTANCE_ID);
      assert.equal(csvRows[0].QID, question.qid);
      assert.equal(csvRows[0].Mean, '91.2');
      assert.equal(csvRows[0].Median, '92.3');
      assert.equal(csvRows[0]['Num. Sub. average'], '3.45');
    });
  });
}

describe('Shared Question Preview', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    await features.enable('question-sharing');
  });

  beforeAll(async () => {
    for (const testQuestion of testQuestions) {
      testQuestion.id = await sqldb.queryScalar(
        sql.select_question_id,
        { qid: testQuestion.qid },
        z.string(),
      );
    }
  });

  beforeAll(async () => {
    // The consuming course below imports `addNumbers` by sharing name.
    await updateCourseSharingName({ course_id: '1', sharing_name: 'test-course' });
    await sqldb.execute(sql.update_share_publicly, { question_id: addNumbers.id });

    // Set up another course to consume shared questions from.
    const consumingCourseData = syncUtil.getCourseData();
    consumingCourseData.course.name = 'CONSUMING 101';
    const courseInstance = consumingCourseData.courseInstances[syncUtil.COURSE_INSTANCE_ID];
    const assessment = courseInstance.assessments[syncUtil.ASSESSMENT_ID];
    assert.isDefined(assessment);
    const zones = assessment.zones;
    assert.isDefined(zones);
    const zone = zones[0];
    assert.isDefined(zone);
    zone.questions.push({
      id: '@test-course/addNumbers',
      points: 10,
    });
    await syncUtil.writeAndSyncCourseData(consumingCourseData);
  });

  beforeAll(async () => {
    const ownerStatsCount = await sqldb.queryScalar(
      sql.update_question_stats_for_course,
      {
        average_number_submissions: 1.23,
        mean_question_score: 12.3,
        median_question_score: 23.4,
        course_id: '1',
        question_id: addNumbers.id,
      },
      z.number(),
    );
    assert.isAbove(ownerStatsCount, 0);

    const consumingStatsCount = await sqldb.queryScalar(
      sql.update_question_stats_for_course,
      {
        average_number_submissions: 3.45,
        mean_question_score: 91.2,
        median_question_score: 92.3,
        course_id: '2',
        question_id: addNumbers.id,
      },
      z.number(),
    );
    assert.equal(consumingStatsCount, 1);
  });

  describe('Public Question Previews', () => {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + '/public/course/1/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    describe('When questions are share_source_publicly but not share_publicly', () => {
      beforeAll(async () => {
        for (const testQuestion of testQuestions) {
          await sqldb.execute(sql.update_share_source_publicly, {
            question_id: testQuestion.id,
          });
        }
      });
      testQuestionPreviews(previewPageInfo, addNumbers, addVectors);
      testFileDownloads(previewPageInfo, downloadFile, false);
      testElementClientFiles(previewPageInfo, customElement);

      it('blocks access in Exam mode', async () => {
        const res = await fetch(`${previewPageInfo.questionBaseUrl}/${addNumbers.id}/preview`, {
          headers: {
            Cookie: 'pl_test_mode=Exam',
          },
        });
        assert.equal(res.status, 403);
      });
    });

    describe('When questions are share_publicly', () => {
      beforeAll(async () => {
        // Publicly share all questions.
        for (const testQuestion of testQuestions) {
          await sqldb.execute(sql.update_share_publicly, { question_id: testQuestion.id });
        }
      });

      testQuestionPreviews(previewPageInfo, addNumbers, addVectors);
      testFileDownloads(previewPageInfo, downloadFile, false);
      testElementClientFiles(previewPageInfo, customElement);

      it('blocks access in Exam mode', async () => {
        const res = await fetch(`${previewPageInfo.questionBaseUrl}/${addNumbers.id}/preview`, {
          headers: {
            Cookie: 'pl_test_mode=Exam',
          },
        });
        assert.equal(res.status, 403);
      });
    });
  });

  describe('User identity is never exposed for shared questions', () => {
    let userInfoQuestionId: string;

    beforeAll(async () => {
      userInfoQuestionId = await sqldb.queryScalar(
        sql.select_question_id,
        { qid: 'userInfo' },
        z.string(),
      );
      // Opt the owning course in to receiving user data. The `userInfo` question
      // renders the variant owner's identity from `data['options']['user']`.
      await updateCourseQuestionsReceiveUserData({
        course_id: '1',
        questions_receive_user_data: true,
        authn_user_id: '1',
        user_id: '1',
        old_questions_receive_user_data: false,
      });
    });

    it('exposes user identity in the owning course when the question is not shared', async () => {
      const res = await fetch(`${baseUrl}/course/1/question/${userInfoQuestionId}/preview`);
      assert.equal(res.status, 200);
      const text = await res.text();
      // First-party render: toggle on, owning course, question not shared, so
      // `options.user` is populated and the viewer's uid appears.
      assert.include(text, 'Variant owner');
      assert.include(text, config.authUid!);
    });

    describe('once the question is shared publicly', () => {
      beforeAll(async () => {
        await sqldb.execute(sql.update_share_publicly, { question_id: userInfoQuestionId });
      });

      it('stops exposing user identity in the owning course preview', async () => {
        const res = await fetch(`${baseUrl}/course/1/question/${userInfoQuestionId}/preview`);
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.include(text, 'No user data is available');
        assert.notInclude(text, 'Variant owner');
        assert.notInclude(text, config.authUid!);
      });

      it('does not expose user identity in the public preview', async () => {
        const res = await fetch(
          `${baseUrl}/public/course/1/question/${userInfoQuestionId}/preview`,
        );
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.include(text, 'No user data is available');
        assert.notInclude(text, 'Variant owner');
        assert.notInclude(text, config.authUid!);
      });
    });
  });

  describe('Shared Question Previews Within a Course', () => {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + '/course/2/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    testFileDownloads(previewPageInfo, downloadFile, false);

    testElementClientFiles(previewPageInfo, customElement);

    testSharedQuestionStatistics(previewPageInfo, addNumbers);
  });

  describe('Shared Question Previews Within a Course Instance', () => {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + '/course_instance/3/instructor/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    testFileDownloads(previewPageInfo, downloadFile, false);

    testElementClientFiles(previewPageInfo, customElement);

    testSharedQuestionStatistics(previewPageInfo, addNumbers);
  });
});
