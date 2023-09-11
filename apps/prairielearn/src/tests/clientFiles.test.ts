import { assert } from 'chai';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as helperExam from './helperExam';
import * as helperServer from './helperServer';

const siteUrl = 'http://localhost:' + config.serverPort;

async function testFile(urlPath: string, expectedContents: string) {
  const response = await fetch(urlPath);
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.equal(body, expectedContents);
}

describe('Client files endpoints', () => {
  before(helperServer.before());
  after(helperServer.after);

  // TODO: refactor this to be a function that we can call in a `before` hook.
  // Right now, this actually creates a bunch of `describe()` blocks and tests.
  helperExam.startExam({});

  describe('clientFilesCourse', () => {
    it('works for instructor course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instructor/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/clientFilesCourse/data.txt`,
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
        `${siteUrl}/pl/course_instance/1/instructor/question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instructor instance question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instructor/instance_question/1/clientFilesCourse/data.txt`,
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
        `${siteUrl}/pl/course_instance/1/assessment/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });

    it('works for instance question URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instance_question/1/clientFilesCourse/data.txt`,
        'This data is specific to the course.',
      );
    });
  });

  describe('clientFilesCourseInstance', () => {
    it('works for instructor course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instructor/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for instructor assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for course instance URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });

    it('works for assessment URL', async () => {
      await testFile(
        `${siteUrl}/pl/course_instance/1/assessment/1/clientFilesCourseInstance/data.txt`,
        'This data is specific to the course instance.',
      );
    });
  });
});
