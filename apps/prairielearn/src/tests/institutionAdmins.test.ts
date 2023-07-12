import { assert } from 'chai';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';
import { queryAsync, queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config';
import helperServer = require('./helperServer');
import { UserSchema } from '../lib/db-types';

const SITE_URL = `http://localhost:${config.serverPort}`;

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
    const res = await withUser(ADMIN_USER, () => fetch(`${SITE_URL}/pl/course/1`));
    assert.isTrue(res.ok);
  });

  step('institution admin cannot access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(`${SITE_URL}/pl/course/1`));
    assert.isFalse(res.ok);
  });

  step('instructor cannot access course', async () => {
    const res = await withUser(INSTRUCTOR_USER, () => fetch(`${SITE_URL}/pl/course/1`));
    assert.isFalse(res.ok);
  });
});
