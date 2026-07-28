import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { updateRequiredPlansForCourseInstance } from '../ee/lib/billing/plans.js';
import { config } from '../lib/config.js';
import type { Course, CourseInstance, User } from '../lib/db-types.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { createInstitution } from '../tests/utils/auth.js';

import { selectAuditEventsByEnrollmentId } from './audit-event.js';
import {
  type ActionableCourseInstanceAdmissionPlan,
  CourseInstanceAdmissionEligibilityError,
  admitUserWithCourseInstanceAdmissionPlan,
  selectCourseInstanceAdmissionPlan,
} from './course-instance-admission.js';
import { selectCourseInstanceById } from './course-instances.js';
import { selectCourseById } from './course.js';
import {
  OTHER_INSTITUTION_ID,
  createEnrollment,
  createUser,
} from './enrollment-reconciliation.test-helpers.js';

const originalIsEnterprise = config.isEnterprise;

describe('ordinary course instance admission', { concurrent: false }, () => {
  let course: Course;
  let courseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    await createInstitution(OTHER_INSTITUTION_ID, 'other.example', 'Other institution');
    courseInstance = await selectCourseInstanceById('1');
    course = await selectCourseById(courseInstance.course_id);
  });

  beforeEach(async () => {
    config.isEnterprise = false;
    await execute('DELETE FROM enrollments WHERE course_instance_id = $course_instance_id', {
      course_instance_id: courseInstance.id,
    });
    await execute(
      `UPDATE course_instances
       SET
         enrollment_limit = NULL,
         publishing_start_date = '1900-01-01T00:00:00Z',
         publishing_end_date = '2400-01-01T00:00:00Z',
         self_enrollment_enabled = TRUE,
         self_enrollment_restrict_to_institution = TRUE,
         self_enrollment_use_enrollment_code = TRUE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    courseInstance = await selectCourseInstanceById(courseInstance.id);
  });

  afterAll(async () => {
    config.isEnterprise = originalIsEnterprise;
    await helperDb.after();
  });

  async function selectPlan(user: User, enrollmentCode?: string) {
    courseInstance = await selectCourseInstanceById(courseInstance.id);
    return await selectCourseInstanceAdmissionPlan({
      course,
      courseInstance,
      enrollmentCode,
      user,
    });
  }

  async function admit(
    user: User,
    plan: ActionableCourseInstanceAdmissionPlan,
    enrollmentCode?: string,
  ) {
    return await admitUserWithCourseInstanceAdmissionPlan({
      courseInstanceId: courseInstance.id,
      enrollmentCode,
      ip: '127.0.0.1',
      isAdministrator: false,
      plan,
      reqDate: new Date(),
      userId: user.id,
    });
  }

  it('distinguishes invitation authority from ordinary bound and guest states', async () => {
    await execute(
      `UPDATE course_instances
       SET self_enrollment_enabled = FALSE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );

    const rosterUser = await createUser({ prefix: 'ordinary-plan-roster' });
    await createEnrollment({
      courseInstance,
      pendingUin: rosterUser.uin,
    });
    await expect(selectPlan(rosterUser)).resolves.toMatchObject({
      source: { type: 'institution_uin' },
      type: 'institution_roster_invitation',
    });

    const leftRosterUser = await createUser({ prefix: 'ordinary-plan-left-roster' });
    await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      status: 'left',
      userId: leftRosterUser.id,
    });
    await createEnrollment({
      courseInstance,
      pendingUin: leftRosterUser.uin,
    });
    await expect(selectPlan(leftRosterUser)).resolves.toMatchObject({
      source: { type: 'institution_uin' },
      type: 'institution_roster_invitation',
    });

    const conventionalUser = await createUser({ prefix: 'ordinary-plan-conventional' });
    await createEnrollment({
      courseInstance,
      pendingUid: conventionalUser.uid,
    });
    await expect(selectPlan(conventionalUser)).resolves.toMatchObject({
      source: { type: 'pending_uid' },
      type: 'conventional_invitation',
    });

    const guestRosterUser = await createUser({ prefix: 'ordinary-plan-guest-roster' });
    await createEnrollment({
      courseInstance,
      isGuest: true,
      pendingUin: guestRosterUser.uin,
    });
    await expect(selectPlan(guestRosterUser)).resolves.toEqual({
      reason: 'self-enrollment-disabled',
      type: 'ineligible',
    });

    const removedRosterUser = await createUser({ prefix: 'ordinary-plan-removed-roster' });
    await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      status: 'removed',
      userId: removedRosterUser.id,
    });
    await createEnrollment({
      courseInstance,
      pendingUin: removedRosterUser.uin,
    });
    await expect(selectPlan(removedRosterUser)).resolves.toEqual({
      reason: 'self-enrollment-disabled',
      type: 'ineligible',
    });

    const blockedRosterUser = await createUser({ prefix: 'ordinary-plan-blocked-roster' });
    await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      status: 'blocked',
      userId: blockedRosterUser.id,
    });
    await createEnrollment({
      courseInstance,
      pendingUin: blockedRosterUser.uin,
    });
    await expect(selectPlan(blockedRosterUser)).resolves.toEqual({ type: 'blocked' });

    const wrongInstitutionUser = await createUser({
      institutionId: OTHER_INSTITUTION_ID,
      prefix: 'ordinary-plan-wrong-institution',
    });
    await createEnrollment({
      courseInstance,
      pendingUin: wrongInstitutionUser.uin,
    });
    await expect(selectPlan(wrongInstitutionUser)).resolves.toEqual({
      reason: 'self-enrollment-disabled',
      type: 'ineligible',
    });
  });

  it('requires ordinary bound left and removed users to satisfy self-enrollment and code rules', async () => {
    for (const status of ['left', 'removed'] as const) {
      const user = await createUser({ prefix: `ordinary-plan-${status}` });
      await createEnrollment({
        courseInstance,
        firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
        status,
        userId: user.id,
      });

      await expect(selectPlan(user)).resolves.toEqual({ type: 'enrollment_code_required' });
      await expect(selectPlan(user, courseInstance.enrollment_code)).resolves.toMatchObject({
        source: { type: 'ordinary' },
        type: 'self_enrollment',
      });
    }
  });

  it('reconciles a bound-left roster admission and audits its source', async () => {
    await execute(
      `UPDATE course_instances
       SET self_enrollment_enabled = FALSE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    const user = await createUser({ prefix: 'ordinary-admit-left-roster' });
    const bound = await createEnrollment({
      courseInstance,
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      status: 'left',
      userId: user.id,
    });
    await createEnrollment({
      courseInstance,
      pendingEmail: 'roster@example.com',
      pendingName: 'Roster name',
      pendingUin: user.uin,
    });

    const plan = await selectPlan(user);
    expect(plan.type).toBe('institution_roster_invitation');
    if (plan.type !== 'institution_roster_invitation') {
      throw new Error('Expected institution roster invitation plan');
    }

    const enrollment = await admit(user, plan);
    expect(enrollment).toMatchObject({
      first_joined_at: new Date('2024-01-01T00:00:00Z'),
      id: bound.id,
      pending_email: null,
      pending_name: null,
      pending_uin: null,
      status: 'joined',
      user_id: user.id,
    });

    const auditEvents = await selectAuditEventsByEnrollmentId({
      enrollment_id: enrollment.id,
      table_names: ['enrollments'],
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        action_detail: 'roster_admitted',
        context: expect.objectContaining({ admission_source: 'institution_uin' }),
      }),
    );
  });

  it('revalidates ordinary self-enrollment and course-instance access after selecting a plan', async () => {
    await execute(
      `UPDATE course_instances
       SET self_enrollment_use_enrollment_code = FALSE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    const ordinaryUser = await createUser({ prefix: 'ordinary-validator-self' });
    const ordinaryPlan = await selectPlan(ordinaryUser);
    expect(ordinaryPlan.type).toBe('self_enrollment');
    if (ordinaryPlan.type !== 'self_enrollment') {
      throw new Error('Expected self-enrollment plan');
    }

    await execute(
      `UPDATE course_instances
       SET self_enrollment_enabled = FALSE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    await expect(admit(ordinaryUser, ordinaryPlan)).rejects.toBeInstanceOf(
      CourseInstanceAdmissionEligibilityError,
    );

    const rosterUser = await createUser({ prefix: 'ordinary-validator-access' });
    await createEnrollment({
      courseInstance,
      pendingUin: rosterUser.uin,
    });
    const rosterPlan = await selectPlan(rosterUser);
    expect(rosterPlan.type).toBe('institution_roster_invitation');
    if (rosterPlan.type !== 'institution_roster_invitation') {
      throw new Error('Expected institution roster invitation plan');
    }

    await execute(
      `UPDATE course_instances
       SET
         publishing_start_date = '2399-01-01T00:00:00Z',
         publishing_end_date = '2400-01-01T00:00:00Z'
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    await expect(admit(rosterUser, rosterPlan)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('fails closed with a fresh ordinary plan when an invitation source disappears', async () => {
    const user = await createUser({ prefix: 'ordinary-validator-disappeared-invitation' });
    const stalePlan = {
      source: { type: 'pending_uid' },
      type: 'conventional_invitation',
    } as const;

    await expect(admit(user, stalePlan)).rejects.toMatchObject({
      name: 'CourseInstanceAdmissionPlanChangedError',
      plan: { type: 'enrollment_code_required' },
    });
  });

  it('enforces enterprise limits and plan grants for roster admission', async () => {
    config.isEnterprise = true;
    await execute(
      `UPDATE course_instances
       SET
         enrollment_limit = 0,
         self_enrollment_enabled = FALSE
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    const limitedUser = await createUser({ prefix: 'ordinary-validator-limit' });
    await createEnrollment({
      courseInstance,
      pendingUin: limitedUser.uin,
    });
    const limitedPlan = await selectPlan(limitedUser);
    expect(limitedPlan.type).toBe('institution_roster_invitation');
    if (limitedPlan.type !== 'institution_roster_invitation') {
      throw new Error('Expected institution roster invitation plan');
    }
    await expect(admit(limitedUser, limitedPlan)).rejects.toMatchObject({
      url: '/pl/enroll/limit_exceeded',
    });

    await execute(
      `UPDATE course_instances
       SET enrollment_limit = NULL
       WHERE id = $course_instance_id`,
      { course_instance_id: courseInstance.id },
    );
    const planGrantUser = await createUser({ prefix: 'ordinary-validator-plan-grant' });
    await createEnrollment({
      courseInstance,
      pendingUin: planGrantUser.uin,
    });
    await execute("DELETE FROM plan_grants WHERE plan_name IN ('compute', 'everything')");
    await updateRequiredPlansForCourseInstance(courseInstance.id, ['compute'], planGrantUser.id);
    const planGrantPlan = await selectPlan(planGrantUser);
    expect(planGrantPlan.type).toBe('institution_roster_invitation');
    if (planGrantPlan.type !== 'institution_roster_invitation') {
      throw new Error('Expected institution roster invitation plan');
    }
    await expect(admit(planGrantUser, planGrantPlan)).rejects.toMatchObject({
      url: `/pl/course_instance/${courseInstance.id}/upgrade`,
    });
  });
});
