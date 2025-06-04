import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const defaultHonorCodeText =
  'I certify that I am Dev User and I am allowed to take this assessment. I pledge on my honor that I will not give or receive any unauthorized assistance on this assessment and that all work will be my own.';

const customHonorCodeHtml =
  '<div class="px-3 py-2 honor-code"><h2>Honor Code</h2> <p>I, Dev User, pledge that I am allowed to take the following assessment and will not receive any unauthorized assistance.</p></div> <div class="card-footer d-flex justify-content-center"> <span class="form-check"> <input type="checkbox" class="form-check-input" id="certify-pledge"> <label class="form-check-label fw-bold" for="certify-pledge"> I certify and pledge the above. </label> </span> </div>';

describe('Exam assessment response to `requireHonorCode`', function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  it('visits the landing page of default assessment', async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam1-automaticTestSuite',
    });
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
    assert.equal(
      response.$('div.test-class-honor-code').children().first().text().replace(/\s+/g, ' ').trim(),
      defaultHonorCodeText,
    );
  });

  it('visits landing page of assessment with disabled honor code', async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam13-disableHonorCode',
    });
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should not see the honor code div anymore
    assert.lengthOf(response.$('div.test-class-honor-code'), 0);
  });

  it('visits the landing page of assessment with a custom honor code', async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam2-miscProblems',
    });
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
    assert.equal(
      response.$('div.test-class-honor-code').html()?.replace(/\s+/g, ' ').trim(),
      customHonorCodeHtml,
    );
  });
});
