import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

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
    assert.lengthOf(response.$('[data-testid="honor-code"]'), 1);
    assert.isTrue(
      response.$('[data-testid="honor-code"]').html()?.includes('I certify that I am Dev User'),
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
    assert.lengthOf(response.$('[data-testid="honor-code"]'), 0);
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

    // The honor code should include the custom markdown
    assert.lengthOf(response.$('[data-testid="honor-code"]'), 1);
    assert.isTrue(response.$('[data-testid="honor-code"]').html()?.includes('<h2>Honor Code</h2>'));
    assert.isTrue(
      response.$('[data-testid="honor-code"]').html()?.includes('I, Dev User, pledge that I am'),
    );
  });
});
