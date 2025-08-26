import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';
import { enrollUser, unenrollUser } from './utils/enrollments.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const USER_1 = {
  name: 'Student 1',
  uid: 'student1@example.com',
  uin: '1',
  email: 'student1@example.com',
};

const USER_2 = {
  name: 'Student 2',
  uid: 'student2@example.com',
  uin: '2',
  email: 'student2@example.com',
};

const USER_3 = {
  name: 'Student 3',
  uid: 'student3@example.com',
  uin: '3',
  email: 'student3@example.com',
};

describe('Enroll page (enterprise)', function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  const originalIsEnterprise = config.isEnterprise;
  beforeAll(() => (config.isEnterprise = true));
  afterAll(() => (config.isEnterprise = originalIsEnterprise));

  test.sequential('enroll a single student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('enrolls the same student again', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('unenroll a single student', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('unenroll the same student again', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('apply an institution-level course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute('UPDATE institutions SET course_instance_enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('set a higher course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 2 WHERE id = 1');
  });

  test.sequential('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  test.sequential('set a yearly enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1');
    await execute(
      'UPDATE institutions SET course_instance_enrollment_limit = 100000, yearly_enrollment_limit = 2 WHERE id = 1',
      {},
    );
  });

  test.sequential('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });
});

// Enrollment limits should not apply for non-enterprise instances (the default).
describe('Enroll page (non-enterprise)', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test.sequential('apply a course instance enrollment limit', async () => {
    await execute('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1');
  });

  test.sequential('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  test.sequential('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  // We want to block access in Exam mode since a student could theoretically
  // use the name of a course on the enrollment page to infiltrate information
  // into an exam.
  test.sequential('ensure that access is blocked in Exam mode', async () => {
    const res = await fetch(`${baseUrl}/enroll`, {
      headers: {
        Cookie: 'pl_test_mode=Exam',
      },
    });
    assert.equal(res.status, 403);
  });
});
