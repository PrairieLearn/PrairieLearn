import * as tmp from 'tmp-promise';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as chunks from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

describe('Generate chunks and use them for a student homework', { timeout: 60_000 }, function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;

  let tempChunksDir: tmp.DirectoryResult;
  const originalChunksConsumerDirectory = config.chunksConsumerDirectory;

  beforeAll(async () => {
    tempChunksDir = await tmp.dir({ unsafeCleanup: true });

    config.chunksConsumer = true;
    config.chunksConsumerDirectory = tempChunksDir.path;

    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    context.assessmentId = assessmentId;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  afterAll(async () => {
    await helperServer.after();
    await tempChunksDir.cleanup();
    config.chunksConsumer = false;
    config.chunksConsumerDirectory = originalChunksConsumerDirectory;
  });

  test.sequential('generate course chunks', async () => {
    const course_ids = ['1'];
    const authn_user_id = '1';
    const job_sequence_id = await chunks.generateAllChunksForCourseList(course_ids, authn_user_id);
    await helperServer.waitForJobSequenceSuccess(job_sequence_id);
  });

  test.sequential('start the homework', async () => {
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

  test.sequential('visit the "Add two numbers" question', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    // Check there are no issues generated
    await helperQuestion.checkNoIssuesForLastVariantAsync();

    // Check the question HTML is correct
    assert.isAtLeast(response.$(':contains("Consider two numbers")').length, 1);
  });
});
