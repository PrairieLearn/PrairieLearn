import { assert } from 'chai';
import { step } from 'mocha-steps';
import { queryAsync } from '@prairielearn/postgres';

import { config } from '../lib/config';
import * as helperServer from './helperServer';
import { enrollUser, unenrollUser } from './utils/enrollments';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const USER_1 = {
  name: 'Student 1',
  uid: 'student1@example.com',
  uin: '1',
};

const USER_2 = {
  name: 'Student 2',
  uid: 'student2@example.com',
  uin: '2',
};

const USER_3 = {
  name: 'Student 3',
  uid: 'student3@example.com',
  uin: '3',
};

describe('Enroll page (enterprise)', function () {
  before(helperServer.before());
  after(helperServer.after);

  const originalIsEnterprise = config.isEnterprise;
  before(async () => (config.isEnterprise = true));
  after(async () => (config.isEnterprise = originalIsEnterprise));

  step('enroll a single student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('enrolls the same student again', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('unenroll a single student', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('unenroll the same student again', async () => {
    const res = await unenrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('apply a course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1', {});
  });

  step('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('apply an institution-level course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1', {});
    await queryAsync(
      'UPDATE institutions SET course_instance_enrollment_limit = 1 WHERE id = 1',
      {},
    );
  });

  step('fail to enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('set a higher course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = 2 WHERE id = 1', {});
  });

  step('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('set a yearly enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1', {});
    await queryAsync(
      'UPDATE institutions SET course_instance_enrollment_limit = 100000, yearly_enrollment_limit = 2 WHERE id = 1',
      {},
    );
  });

  step('fail to enroll a third student', async () => {
    const res = await enrollUser('1', USER_3);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });
});

// Enrollment limits should not apply for non-enterprise instances (the default).
describe('Enroll page (non-enterprise)', () => {
  before(helperServer.before());
  after(helperServer.after);

  step('apply a course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1', {});
  });

  step('enroll one student', async () => {
    const res = await enrollUser('1', USER_1);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });

  step('enroll a second student', async () => {
    const res = await enrollUser('1', USER_2);
    assert.isOk(res.ok);
    assert.equal(res.url, baseUrl + '/enroll');
  });
});
