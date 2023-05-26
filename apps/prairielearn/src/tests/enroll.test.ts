import { assert } from 'chai';
import cheerio = require('cheerio');
import { step } from 'mocha-steps';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import helperServer = require('./helperServer');
import { queryAsync } from '@prairielearn/postgres';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

type AuthUser = {
  name: string;
  uid: string;
  uin: string;
};

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

async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
  }
}

async function getCsrfToken(user: AuthUser): Promise<string> {
  return await withUser(user, async () => {
    const res = await fetch(baseUrl + '/enroll');
    assert.isOk(res.ok);
    const $ = cheerio.load(await res.text());
    return $('span[id=test_csrf_token]').text();
  });
}

async function enrollUser(user: AuthUser) {
  return await withUser(user, async () => {
    return await fetch(baseUrl + '/enroll', {
      method: 'POST',
      body: new URLSearchParams({
        course_instance_id: '1',
        __action: 'enroll',
        __csrf_token: await getCsrfToken(user),
      }),
    });
  });
}

async function unenrollUser(user: AuthUser) {
  return await withUser(user, async () => {
    return await fetch(baseUrl + '/enroll', {
      method: 'POST',
      body: new URLSearchParams({
        course_instance_id: '1',
        __action: 'unenroll',
        __csrf_token: await getCsrfToken(user),
      }),
    });
  });
}

describe('Enroll page', function () {
  before(helperServer.before());
  after(helperServer.after);

  step('enroll a single student', async () => {
    const res = await enrollUser(USER_1);
    assert.isOk(res.ok);
  });

  step('enrolls the same student again', async () => {
    const res = await enrollUser(USER_1);
    assert.isOk(res.ok);
  });

  step('unenroll a single student', async () => {
    const res = await unenrollUser(USER_1);
    assert.isOk(res.ok);
  });

  step('unenroll the same student again', async () => {
    const res = await unenrollUser(USER_1);
    assert.isOk(res.ok);
  });

  step('apply a course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = 1 WHERE id = 1', {});
  });

  step('enroll one student', async () => {
    const res = await enrollUser(USER_1);
    assert.isOk(res.ok);
  });

  step('fail to enroll a second student', async () => {
    const res = await enrollUser(USER_2);
    assert.isNotOk(res.ok);
    assert.equal(res.status, 403);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('apply an institution-level course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1', {});
    await queryAsync(
      'UPDATE institutions SET course_instance_enrollment_limit = 1 WHERE id = 1',
      {}
    );
  });

  step('fail to enroll a second student', async () => {
    const res = await enrollUser(USER_2);
    assert.isNotOk(res.ok);
    assert.equal(res.status, 403);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('set a higher course instance enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = 2 WHERE id = 1', {});
  });

  step('enroll a second student', async () => {
    const res = await enrollUser(USER_2);
    assert.isOk(res.ok);
  });

  step('fail to enroll a third student', async () => {
    const res = await enrollUser(USER_3);
    assert.isNotOk(res.ok);
    assert.equal(res.status, 403);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });

  step('set a yearly enrollment limit', async () => {
    await queryAsync('UPDATE course_instances SET enrollment_limit = NULL WHERE id = 1', {});
    await queryAsync(
      'UPDATE institutions SET course_instance_enrollment_limit = NULL, yearly_enrollment_limit = 2 WHERE id = 1',
      {}
    );
  });

  step('fail to enroll a third student', async () => {
    const res = await enrollUser(USER_3);
    assert.isNotOk(res.ok);
    assert.equal(res.status, 403);
    assert.equal(res.url, baseUrl + '/enroll/limit_exceeded');
  });
});
