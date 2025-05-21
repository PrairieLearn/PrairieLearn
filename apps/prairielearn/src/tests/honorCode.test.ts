import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import type { CourseInstance } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Exam assessment response to `requireHonorCode`', function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  let courseInstance: CourseInstance;

  beforeAll(async () => {
    await helperServer.before()();
    courseInstance = await selectCourseInstanceByShortName({
      course_id: '1',
      short_name: 'Sp15',
    });
  });

  afterAll(helperServer.after);

  it('visits the landing page of default assessment', async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      tid: 'exam1-automaticTestSuite',
      course_instance_id: courseInstance.id,
    });
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should see the honor code div by default
    assert.lengthOf(response.$('div.test-class-honor-code'), 1);
  });

  it('visits landing page of assessment with disabled honor code', async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      tid: 'exam13-disableHonorCode',
      course_instance_id: courseInstance.id,
    });
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;

    const response = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    // We should not see the honor code div anymore
    assert.lengthOf(response.$('div.test-class-honor-code'), 0);
  });
});
