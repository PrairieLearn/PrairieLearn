import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { type Question, QuestionSchema } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { selectUserByUid } from '../models/user.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import {
  testElementClientFiles,
  testFileDownloads,
  testQuestionPreviews,
} from './helperQuestionPreview.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceBaseUrl = baseUrl + '/course_instance/1/instructor';
const questionsUrl = courseInstanceBaseUrl + '/course_admin/questions';
const questionsUrlCourse = baseUrl + '/course/1/course_admin/questions';

const COURSE_ID = '1';

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
const differentiatePolynomial = {
  id: '',
  qid: 'differentiatePolynomial',
  type: 'Freeform',
  title: 'Differentiate a polynomial function of one variable',
};
const customElement = {
  id: '',
  qid: 'customElement',
  type: 'Freeform',
  title: 'Demo: Custom element',
};
const testQuestions = [
  addNumbers,
  addVectors,
  downloadFile,
  differentiatePolynomial,
  customElement,
];

describe('Instructor questions', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  let questionData: { id: string; qid: string; title: string }[];

  async function loadQuestionDataFromTrpc() {
    const authnUserId = (await selectUserByUid('dev@example.com')).id;
    const csrfToken = generatePrefixCsrfToken(
      { url: getCourseTrpcUrl(COURSE_ID), authn_user_id: authnUserId },
      config.secretKey,
    );
    const trpcClient = createCourseTrpcClient({
      csrfToken,
      courseId: COURSE_ID,
      urlBase: siteUrl,
    });

    const questions = await trpcClient.questions.list.query();
    return questions.map(({ id, qid, title }) => ({ id, qid, title }));
  }

  describe('the database', function () {
    let questions: Question[];
    it('should contain questions', async () => {
      questions = await sqldb.queryRows(sql.select_questions, QuestionSchema);
      if (questions.length === 0) {
        throw new Error('no questions in DB');
      }
    });

    for (const testQuestion of testQuestions) {
      it(`should contain the ${testQuestion.qid} question`, function () {
        const foundQuestion = questions.find((question) => question.directory === testQuestion.qid);
        assert.isDefined(foundQuestion);
        testQuestion.id = foundQuestion.id;
      });
    }
  });

  describe('GET ' + questionsUrlCourse, function () {
    it('should load successfully', async () => {
      const res = await fetch(questionsUrlCourse);
      assert.equal(res.status, 200);
    });
    it('should fetch question data from tRPC endpoint', async () => {
      questionData = await loadQuestionDataFromTrpc();
      assert.isArray(questionData);
      questionData.forEach((question) => assert.isObject(question));
    });

    for (const testQuestion of testQuestions) {
      it(`should include ${testQuestion.qid} question`, function () {
        const elemList = questionData.filter((question) => idsEqual(question.id, testQuestion.id));
        assert.lengthOf(elemList, 1);
        assert.equal(testQuestion.qid, elemList[0].qid);
        assert.equal(testQuestion.title, elemList[0].title);
      });
    }
  });

  describe('GET ' + questionsUrl, function () {
    it('should load successfully', async () => {
      const res = await fetch(questionsUrl);
      assert.equal(res.status, 200);
    });
    it('should fetch question data from tRPC endpoint', async () => {
      questionData = await loadQuestionDataFromTrpc();
      assert.isArray(questionData);
      questionData.forEach((question) => assert.isObject(question));
    });
    for (const testQuestion of testQuestions) {
      it(`should include ${testQuestion.qid} question`, function () {
        const elemList = questionData.filter((question) => idsEqual(question.id, testQuestion.id));
        assert.lengthOf(elemList, 1);
        assert.equal(testQuestion.qid, elemList[0].qid);
        assert.equal(testQuestion.title, elemList[0].title);
      });
    }
  });

  describe('Test Question Previews', function () {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: courseInstanceBaseUrl + '/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);
    testFileDownloads(previewPageInfo, downloadFile, true);
    testElementClientFiles(previewPageInfo, customElement);
  });

  describe('QID redirect routes', () => {
    it('redirects to the correct question from course route', async () => {
      const res = await fetch(`${questionsUrlCourse}/qid/addNumbers?variant_seed=1234`);
      assert.equal(res.status, 200);
      assert.equal(
        res.url,
        `${baseUrl}/course/1/question/${addNumbers.id}/preview?variant_seed=1234`,
      );
    });

    it('redirects to the correct question from instance route', async () => {
      const res = await fetch(`${questionsUrl}/qid/addNumbers?variant_seed=1234`);
      assert.equal(res.status, 200);
      assert.equal(
        res.url,
        `${baseUrl}/course_instance/1/instructor/question/${addNumbers.id}/preview?variant_seed=1234`,
      );
    });
  });
});
