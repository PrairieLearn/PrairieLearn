import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { dangerousFullAuthzForTesting } from '../../lib/authz-data-lib.js';
import { CourseInstanceSchema } from '../../lib/db-types.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { ensureEnrollment } from '../../models/enrollment.js';
import { uniqueEnrollmentCode } from '../../sync/fromDisk/courseInstances.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';

import {
  getEnrollmentCountsForCourse,
  getEnrollmentCountsForCourseInstance,
  getEnrollmentCountsForInstitution,
} from './enrollment.js';
import { ensurePlanGrant } from './plan-grants.js';

describe('getEnrollmentCountsForInstitution', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('returns zero enrollments by default', async () => {
    const result = await getEnrollmentCountsForInstitution({
      institution_id: '1',
      created_since: '1 year',
    });

    assert.equal(result.free, 0);
    assert.equal(result.paid, 0);
  });

  it('returns correct counts across course instances', async () => {
    // The test course only has a single course instance, so we'll create a
    // second one for more complete tests.
    const courseInstance = await queryRow(
      'INSERT INTO course_instances (course_id, display_timezone, enrollment_code) VALUES ($course_id, $display_timezone, $enrollment_code) RETURNING *',
      {
        course_id: 1,
        display_timezone: 'UTC',
        enrollment_code: await uniqueEnrollmentCode(),
      },
      CourseInstanceSchema,
    );
    const firstCourseInstance = await selectCourseInstanceById('1');

    const freeUser = await getOrCreateUser({
      uid: 'free@example.com',
      name: 'Free Student',
      uin: 'free1',
      email: 'free@example.com',
    });
    const paidUser1 = await getOrCreateUser({
      uid: 'paid1@example.com',
      name: 'Paid Student 1',
      uin: 'paid1',
      email: 'paid1@example.com',
    });
    const paidUser2 = await getOrCreateUser({
      uid: 'paid2@example.com',
      name: 'Paid Student 2',
      uin: 'paid2',
      email: 'paid2@example.com',
    });

    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: freeUser.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: paidUser1.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });
    await ensureEnrollment({
      courseInstance,
      userId: paidUser2.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: freeUser.user_id,
        // This plan grant should not make this user count as a paid enrollment.
        plan_name: 'compute',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: paidUser1.user_id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: courseInstance.id,
        user_id: paidUser2.user_id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    const result = await getEnrollmentCountsForInstitution({
      institution_id: '1',
      created_since: '1 year',
    });

    assert.equal(result.free, 1);
    assert.equal(result.paid, 2);
  });
});

describe('getEnrollmentCountsForCourse', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('returns zero enrollments by default', async () => {
    const result = await getEnrollmentCountsForCourse({ course_id: '1', created_since: '1 year' });

    assert.equal(result.free, 0);
    assert.equal(result.paid, 0);
  });

  it('returns a single free enrollment', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });
    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    const result = await getEnrollmentCountsForCourse({ course_id: '1', created_since: '1 year' });

    assert.equal(result.free, 1);
    assert.equal(result.paid, 0);
  });

  it('returns a single paid enrollment', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });

    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.user_id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    const result = await getEnrollmentCountsForCourse({ course_id: '1', created_since: '1 year' });
    assert.equal(result.free, 0);
    assert.equal(result.paid, 1);
  });

  it('does not include non-basic plan grants', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });

    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.user_id,
        plan_name: 'compute',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    const result = await getEnrollmentCountsForCourse({ course_id: '1', created_since: '1 year' });
    assert.equal(result.free, 1);
    assert.equal(result.paid, 0);
  });
});

describe('getEnrollmentCountsForCourseInstance', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async function () {
    await helperDb.after();
  });

  it('returns zero enrollments by default', async () => {
    const result = await getEnrollmentCountsForCourseInstance('1');

    assert.equal(result.free, 0);
    assert.equal(result.paid, 0);
  });

  it('returns a single free enrollment', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });
    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    const result = await getEnrollmentCountsForCourseInstance('1');

    assert.equal(result.free, 1);
    assert.equal(result.paid, 0);
  });

  it('returns a single paid enrollment', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });

    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.user_id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    const result = await getEnrollmentCountsForCourseInstance('1');
    assert.equal(result.free, 0);
    assert.equal(result.paid, 1);
  });

  it('does not include non-basic plan grants', async () => {
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });

    const firstCourseInstance = await selectCourseInstanceById('1');
    await ensureEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.user_id,
      requestedRole: 'Student',
      authzData: dangerousFullAuthzForTesting(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.user_id,
        plan_name: 'compute',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    const result = await getEnrollmentCountsForCourseInstance('1');
    assert.equal(result.free, 1);
    assert.equal(result.paid, 0);
  });
});
