import { assert } from 'chai';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';

import { queryAsync, queryRow } from '@prairielearn/postgres';

import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { config } from '../../lib/config.js';
import { UserSchema } from '../../lib/db-types.js';
import { selectUserByUid } from '../../models/user.js';
import * as helperServer from '../helperServer.js';
import { withUser } from '../utils/auth.js';

const SITE_URL = `http://localhost:${config.serverPort}`;
const INSTITUTION_ADMIN_COURSES = `${SITE_URL}/pl/institution/1/admin/courses`;
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
  uin: 'admin',
  email: 'admin@example.com',
  isAdministrator: true,
};

const INSTITUTION_ADMIN_USER = {
  name: 'Institution Admin',
  uid: 'institution-admin@example.com',
  uin: 'institution-admin',
  email: 'institution-admin@example.com',
};

async function insertUser(user: AuthUser) {
  const newUser = await queryRow(
    'INSERT INTO users (name, uid) VALUES ($name, $uid) RETURNING *;',
    {
      name: user.name,
      uid: user.uid,
    },
    UserSchema,
  );

  if (user.isAdministrator) {
    await queryAsync('INSERT INTO administrators (user_id) VALUES ($user_id);', {
      user_id: newUser.user_id,
    });
  }
}

describe('institution administrators', () => {
  before(() => (config.isEnterprise = true));
  after(() => (config.isEnterprise = false));

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before(async () => {
    await insertUser(ADMIN_USER);
    await insertUser(INSTITUTION_ADMIN_USER);
  });

  step('global admin can access institution admin courses', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
    assert.equal(res.status, 200);
  });

  step('global admin can access course', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 200);
  });

  step('global admin can access course instance', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.equal(res.status, 200);
  });

  step('institution admin (no permissions) cannot access institution admin courses', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
    assert.equal(res.status, 403);
  });

  step('institution admin (no permissions) cannot access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 403);
  });

  step('institution admin (no permissions) cannot access course instance', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.equal(res.status, 403);
  });

  step('institution admin (no permissions) can access assessment instances', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(ASSESSMENT_INSTANCES_URL));
    assert.equal(res.status, 403);
  });

  step('grant institution admin permissions', async () => {
    const user = await selectUserByUid(INSTITUTION_ADMIN_USER.uid);
    assert(user);
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: user.user_id,
      authn_user_id: '1',
    });
  });

  step('institution admin can access institution admin courses', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
    assert.equal(res.status, 200);
  });

  step('institution admin can access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 200);
  });

  step('institution admin can access course instance', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_INSTANCE_URL));
    assert.equal(res.status, 200);
  });

  step('institution admin can access assessment instances', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(ASSESSMENT_INSTANCES_URL));
    assert.equal(res.status, 200);
  });
});
