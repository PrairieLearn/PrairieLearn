import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, queryRow } from '@prairielearn/postgres';

import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { config } from '../../lib/config.js';
import { type Assessment, type CourseInstance, UserSchema } from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalUserByUid } from '../../models/user.js';
import * as helperServer from '../helperServer.js';
import { withUser } from '../utils/auth.js';

const SITE_URL = `http://localhost:${config.serverPort}`;
const INSTITUTION_ADMIN_COURSES = `${SITE_URL}/pl/institution/1/admin/courses`;
const COURSE_URL = `${SITE_URL}/pl/course/1/course_admin/instances`;

function getCourseInstanceUrl(courseInstance: CourseInstance) {
  return `${SITE_URL}/pl/course_instance/${courseInstance.id}/instructor/course_admin/instances`;
}

function getAssessmentInstancesUrl(courseInstance: CourseInstance, assessment: Assessment) {
  return `${SITE_URL}/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/instances`;
}

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
    await execute('INSERT INTO administrators (user_id) VALUES ($user_id);', {
      user_id: newUser.user_id,
    });
  }
}

describe('institution administrators', () => {
  beforeAll(() => (config.isEnterprise = true));
  afterAll(() => (config.isEnterprise = false));

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  let courseInstance: CourseInstance;
  let assessment: Assessment;
  beforeAll(async () => {
    await insertUser(ADMIN_USER);
    await insertUser(INSTITUTION_ADMIN_USER);
    courseInstance = await selectCourseInstanceByShortName({ course_id: '1', short_name: 'Sp15' });
    assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw1-automaticTestSuite',
    });
  });

  test.sequential('global admin can access institution admin courses', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
    assert.equal(res.status, 200);
  });

  test.sequential('global admin can access course', async () => {
    const res = await withUser(ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 200);
  });

  test.sequential('global admin can access course instance', async () => {
    const url = getCourseInstanceUrl(courseInstance);
    const res = await withUser(ADMIN_USER, () => fetch(url));
    assert.equal(res.status, 200);
  });

  test.sequential(
    'institution admin (no permissions) cannot access institution admin courses',
    async () => {
      const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
      assert.equal(res.status, 403);
    },
  );

  test.sequential('institution admin (no permissions) cannot access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 403);
  });

  test.sequential('institution admin (no permissions) cannot access course instance', async () => {
    const url = getCourseInstanceUrl(courseInstance);
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(url));
    assert.equal(res.status, 403);
  });

  test.sequential(
    'institution admin (no permissions) can access assessment instances',
    async () => {
      const url = getAssessmentInstancesUrl(courseInstance, assessment);
      const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(url));
      assert.equal(res.status, 403);
    },
  );

  test.sequential('grant institution admin permissions', async () => {
    const user = await selectOptionalUserByUid(INSTITUTION_ADMIN_USER.uid);
    assert(user);
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: user.user_id,
      authn_user_id: '1',
    });
  });

  test.sequential('institution admin can access institution admin courses', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(INSTITUTION_ADMIN_COURSES));
    assert.equal(res.status, 200);
  });

  test.sequential('institution admin can access course', async () => {
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(COURSE_URL));
    assert.equal(res.status, 200);
  });

  test.sequential('institution admin can access course instance', async () => {
    const url = getCourseInstanceUrl(courseInstance);
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(url));
    assert.equal(res.status, 200);
  });

  test.sequential('institution admin can access assessment instances', async () => {
    const url = getAssessmentInstancesUrl(courseInstance, assessment);
    const res = await withUser(INSTITUTION_ADMIN_USER, () => fetch(url));
    assert.equal(res.status, 200);
  });
});
