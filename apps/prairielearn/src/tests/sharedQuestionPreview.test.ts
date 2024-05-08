import { z } from 'zod';

import {
  testQuestionPreviews,
  testFileDownloads,
  testElementClientFiles,
} from './helperQuestionPreview';
import { config } from '../lib/config';
import { features } from '../lib/features/index';
import * as sqldb from '@prairielearn/postgres';
import * as helperServer from './helperServer';
import * as syncUtil from './sync/util';

const sql = sqldb.loadSqlEquiv(__filename);

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

describe('Shared Question Preview', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await features.enable('question-sharing');
  });

  before('Get question IDs from database', async function () {
    for (const testQuestion of testQuestions) {
      testQuestion.id = await sqldb.queryRow(
        sql.select_question_id,
        {
          qid: testQuestion.qid,
        },
        z.string(),
      );
      await sqldb.queryAsync(sql.update_shared_publicly, { question_id: testQuestion.id });
    }
  });

  before('set up another course to consume shared questions from ', async () => {
    const consumingCourseData = syncUtil.getCourseData();
    consumingCourseData.course.name = 'CONSUMING 101';
    await syncUtil.writeAndSyncCourseData(consumingCourseData);
  });

  describe('Test Public Question Previews', function () {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + '/public/course/1/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    testFileDownloads(previewPageInfo, downloadFile, false);

    // TODO: implement
    // testElementClientFiles(previewPageInfo, customElement);
  });

  describe('Test Shared Question Previews Within a Course', function () {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + `/course/2/question`,
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    testFileDownloads(previewPageInfo, downloadFile, false);

    testElementClientFiles(previewPageInfo, customElement);
  });
});
