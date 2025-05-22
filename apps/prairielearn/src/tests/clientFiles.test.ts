import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import type { Assessment, CourseInstance } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';

import * as helperExam from './helperExam.js';
import * as helperServer from './helperServer.js';

const siteUrl = 'http://localhost:' + config.serverPort;

async function testFile(urlPath: string, expectedContents: string) {
  const response = await fetch(urlPath);
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.equal(body, expectedContents);
}

describe('Client files endpoints', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  let courseInstance: CourseInstance;
  let assessment: Assessment;
  beforeAll(async () => {
    courseInstance = await selectCourseInstanceByShortName({ course_id: '1', short_name: 'Sp15' });
    assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw1-automaticTestSuite',
    });
  });

  // TODO: refactor this to be a function that we can call in a `before` hook.
  // Right now, this actually creates a bunch of `describe()` blocks and tests.
  helperExam.startExam({});

  describe('clientFilesCourse', () => {
    it('works for instructor course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor course question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course/1/question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor course instance question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor instance question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/instance_question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for course URL', async () => {
      await testFile(
        `${siteUrl}/pl/course/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instance question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instance_question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });
  });

  describe('clientFilesCourseInstance', () => {
    it('works for instructor course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for instructor assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/${courseInstance.id}/assessment/${assessment.id}/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });
  });
});
