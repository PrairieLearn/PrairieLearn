import { assert } from 'chai';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';
import { queryAsync, queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config';
import helperServer = require('./helperServer');
import { UserSchema } from '../lib/db-types';
import { selectUserByUid } from '../lib/user';

const SITE_URL = `http://localhost:${config.serverPort}`;
const COURSE_URL = `${SITE_URL}/pl/course/1/course_admin/instances`;
const COURSE_INSTANCE_URL = `${SITE_URL}/pl/course_instance/1/instructor/instance_admin/assessments`;
const ASSESSMENT_INSTANCES_URL = `${SITE_URL}/pl/course_instance/1/instructor/assessment/1/instances`;

interface AuthUser {
  name: string;
  uid: string;
  uin?: string;
  isAdministrator?: boolean;
}

const ADMIN_USER = {
  name: 'Admin',
  uid: 'admin@example.com',
  isAdministrator: true,
};

const INSTITUTION_ADMIN_USER = {
  name: 'Institution Admin',
  uid: 'institution-admin@example.com',
};

const INSTRUCTOR_USER = {
  name: 'Instructor',
  uid: 'instructor@example.com',
};

async function insertUser(user: AuthUser) {
  const newUser = await queryRow(
    `INSERT INTO users (name, uid) VALUES ($name, $uid) RETURNING *;`,
    {
      name: user.name,
      uid: user.uid,
    },
    UserSchema,
  );

  if (user.isAdministrator) {
    await queryAsync(`INSERT INTO administrators (user_id) VALUES ($user_id);`, {
      user_id: newUser.user_id,
    });
  }
}

async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin ?? user.uid;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
  }
}

describe('institution administrators', () => {
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);
  before(async () => {
    await insertUser(ADMIN_USER);
    await insertUser(INSTITUTION_ADMIN_USER);
    await insertUser(INSTRUCTOR_USER);
  });

  step('global admin can access course', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(COURSE_URL));
    console.log(res);
    assert.isTrue(res.ok);
  });

  step('global admin can access course instance', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.isTrue(res.ok);
  });

  step('institution admin cannot access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_URL));
    assert.isFalse(res.ok);
  });

  step('institution admin cannot access course instance', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.isFalse(res.ok);
  });

  step('institution admin can access assessment instances', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(ASSESSMENT_INSTANCES_URL));
    assert.isFalse(res.ok);
  });

  step('instructor cannot access course', async () => {
    const res = await withUser(INSTRUCTOR_USER, () => fetch(COURSE_URL));
    assert.isFalse(res.ok);
  });

  step('instructor cannot access course instance', async () => {
    const res = await withUser(INSTRUCTOR_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.isFalse(res.ok);
  });

  step('add institution administrator', async () => {
    const user = await selectUserByUid(INSTITUTION_ADMIN_USER.uid);
    assert(user);
    await queryAsync(
      `INSERT INTO institution_administrators (institution_id, user_id) VALUES ($institution_id, $user_id);`,
      {
        institution_id: '1',
        user_id: user.user_id,
      },
    );
  });

  step('institution admin can access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(`${SITE_URL}/pl/course/1`));
    assert.isTrue(res.ok);
  });

  step('institution admin can access course instance', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.isTrue(res.ok);
  });

  step('institution admin can access assessment instances', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(ASSESSMENT_INSTANCES_URL));
    assert.isTrue(res.ok);
  });
});
