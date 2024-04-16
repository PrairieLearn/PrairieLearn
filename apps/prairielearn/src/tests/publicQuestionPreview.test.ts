import { testQuestionPreviews, testFileDownloads } from './helperQuestionPreview';
import { config } from '../lib/config';
import { z } from 'zod';
import { features } from '../lib/features/index';
import * as sqldb from '@prairielearn/postgres';
import * as helperServer from './helperServer';
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
    downloadFile.id = await sqldb.queryRow(
      sql.select_question_id,
      {
        qid: downloadFile.qid,
      },
      z.string(),
    );
    await sqldb.queryAsync(sql.update_shared_publicly, { question_id: addNumbers.id });
    await sqldb.queryAsync(sql.update_shared_publicly, { question_id: addVectors.id });
    await sqldb.queryAsync(sql.update_shared_publicly, { question_id: downloadFile.id });
  });

  describe('Test Question Previews', function () {
    const previewPageInfo = {
      siteUrl,
      baseUrl,
      questionBaseUrl: baseUrl + '/public/course/1/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);

    testFileDownloads(previewPageInfo, downloadFile, false);
  });
});
