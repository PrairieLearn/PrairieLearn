import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as tmp from 'tmp-promise';

import { config } from '../lib/config';
import * as chunks from '../lib/chunks';
import * as sqldb from '@prairielearn/postgres';

import * as helperServer from './helperServer';
import * as helperClient from './helperClient';
import * as helperQuestion from './helperQuestion';

const sql = sqldb.loadSqlEquiv(__filename);

describe('Generate chunks and use them for a student homework', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;

  let tempChunksDir: tmp.DirectoryResult;
  const originalChunksConsumerDirectory = config.chunksConsumerDirectory;

  before('set up testing server', async () => {
    tempChunksDir = await tmp.dir({ unsafeCleanup: true });

    config.chunksConsumer = true;
    config.chunksConsumerDirectory = tempChunksDir.path;

    await helperServer.before().call(this);
    const results = await sqldb.queryOneRowAsync(sql.select_hw1, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  after('shut down testing server', async () => {
    await helperServer.after.call(this);
    await tempChunksDir.cleanup();
    config.chunksConsumer = false;
    config.chunksConsumerDirectory = originalChunksConsumerDirectory;
  });

  step('generate course chunks', async () => {
    const course_ids = ['1'];
    const authn_user_id = '1';
    const job_sequence_id = await chunks.generateAllChunksForCourseList(course_ids, authn_user_id);
    await helperServer.waitForJobSequenceSuccessAsync(job_sequence_id);
  });

  step('start the homework', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    // save the questionUrl for later
    const questionUrl = response.$('a:contains("Add two numbers")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;
  });

  step('visit the "Add two numbers" question', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    // Check there are no issues generated
    await helperQuestion.checkNoIssuesForLastVariantAsync();

    // Check the question HTML is correct
    assert.isAtLeast(response.$(':contains("Consider two numbers")').length, 1);
  });
});
