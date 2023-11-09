import { testQuestionPreviews } from './helperQuestionPreview';
import { config } from '../lib/config';
import { z } from 'zod';
import { features } from '../lib/features/index';
import sqldb = require('@prairielearn/postgres');
import helperServer = require('./helperServer');
const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseBaseUrl = baseUrl + '/course/1';

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

describe('Public Question Preview', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has question sharing enabled', async () => {
    await features.enable('question-sharing');
  });

  before('Get question IDs from database', async function () {
    addNumbers.id = await sqldb.queryRow(
      sql.select_question_id,
      {
        qid: addNumbers.qid,
      },
      z.string(),
    );
    addVectors.id = await sqldb.queryRow(
      sql.select_question_id,
      {
        qid: addVectors.qid,
      },
      z.string(),
    );
    await sqldb.queryAsync(sql.update_shared_publicly, { question_id: addNumbers.id });
    await sqldb.queryAsync(sql.update_shared_publicly, { question_id: addVectors.id });
  });

  describe('Test Question Previews', function () {
    const previewPageInfo = {
      siteUrl: siteUrl,
      baseUrl: baseUrl,
      courseBaseUrl: courseBaseUrl,
      questionBaseUrl: baseUrl + '/public/course/1/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    // TODO: implement file downloads for publicly shared questions
    // testFileDownloads(previewPageInfo, downloadFile);
  });
});
