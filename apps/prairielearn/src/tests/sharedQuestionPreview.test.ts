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
    // Set up another course to consume shared questions from.
    const consumingCourseData = syncUtil.getCourseData();
    consumingCourseData.course.name = 'CONSUMING 101';
    await syncUtil.writeAndSyncCourseData(consumingCourseData);
  });

  beforeAll(async () => {
    // Set up a sharing_name on the test course for public question previews
    await updateCourseSharingName({ course_id: '1', sharing_name: 'test-course' });
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
  });
});
