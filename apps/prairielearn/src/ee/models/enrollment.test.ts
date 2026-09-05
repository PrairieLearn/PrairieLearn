import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { CourseInstanceSchema } from '../../lib/db-types.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { selectInstitutionForCourse } from '../../models/institution.js';
import { uniqueEnrollmentCode } from '../../sync/fromDisk/courseInstances.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';
import { type PlanName } from '../lib/billing/plans-types.js';
import { updateRequiredPlansForCourseInstance } from '../lib/billing/plans.js';

import {
  PotentialEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
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
      'INSERT INTO course_instances (course_id, short_name, display_timezone, enrollment_code) VALUES ($course_id, $short_name, $display_timezone, $enrollment_code) RETURNING *',
      {
        course_id: 1,
        short_name: 'Test CI',
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

    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: freeUser.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: paidUser1.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
    await ensureUncheckedEnrollment({
      courseInstance,
      userId: paidUser2.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: freeUser.id,
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
        user_id: paidUser1.id,
        plan_name: 'basic',
        type: 'stripe',
      },
      authn_user_id: '1',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: courseInstance.id,
        user_id: paidUser2.id,
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.id,
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.id,
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.id,
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
    await ensureUncheckedEnrollment({
      courseInstance: firstCourseInstance,
      userId: user.id,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await ensurePlanGrant({
      plan_grant: {
        institution_id: '1',
        course_instance_id: '1',
        user_id: user.id,
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

describe('checkPotentialEnterpriseEnrollment', () => {
  beforeEach(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async () => {
    await helperDb.after();
  });

  async function setupEnrollment(planNames: PlanName[]) {
    const course = await selectCourseById('1');
    const institution = await selectInstitutionForCourse({ course_id: course.id });
    const courseInstance = await selectCourseInstanceById('1');
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student',
    });
    for (const plan_name of planNames) {
      await ensurePlanGrant({
        plan_grant: {
          institution_id: institution.id,
          course_instance_id: courseInstance.id,
          user_id: user.id,
          plan_name,
          type: 'stripe',
        },
        authn_user_id: '1',
      });
    }
    await updateRequiredPlansForCourseInstance(courseInstance.id, planNames, '1');
    return {
      institution,
      course,
      courseInstance,
      authzData: { user, authn_course_role: 'None', authn_course_instance_role: 'None' },
    };
  }

  const plans: PlanName[][] = [[], ['basic'], ['compute'], ['basic', 'compute']];
  describe.each(plans.map((planNames) => ({ planNames })))(
    'with $planNames grants',
    ({ planNames }) => {
      it.each(['institution', 'course', 'course instance'])(
        'checks an exhausted %s limit',
        async (limit) => {
          const context = await setupEnrollment(planNames);
          // With no enrollments, a zero limit is already exhausted.
          if (limit === 'institution') context.institution.yearly_enrollment_limit = 0;
          if (limit === 'course') context.course.yearly_enrollment_limit = 0;
          if (limit === 'course instance') context.courseInstance.enrollment_limit = 0;

          assert.equal(
            await checkPotentialEnterpriseEnrollment(context),
            planNames.includes('basic')
              ? PotentialEnrollmentStatus.ALLOWED
              : PotentialEnrollmentStatus.LIMIT_EXCEEDED,
          );
        },
      );

      it('allows enrollment when capacity is available', async () => {
        const context = await setupEnrollment(planNames);
        assert.equal(
          await checkPotentialEnterpriseEnrollment(context),
          PotentialEnrollmentStatus.ALLOWED,
        );
      });
    },
  );

  it.each(['basic', 'compute'] satisfies PlanName[])(
    'requires all plans before bypassing limits with %s access',
    async (planName) => {
      const context = await setupEnrollment([planName]);
      await updateRequiredPlansForCourseInstance(
        context.courseInstance.id,
        ['basic', 'compute'],
        '1',
      );
      context.courseInstance.enrollment_limit = 0;
      assert.equal(
        await checkPotentialEnterpriseEnrollment(context),
        PotentialEnrollmentStatus.PLAN_GRANTS_REQUIRED,
      );
    },
  );
});
