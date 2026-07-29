import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { selectCourseInstanceById } from '../../models/course-instances.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { createInstitution } from '../../tests/utils/auth.js';
import { type CourseInstance, type Enrollment, type User } from '../db-types.js';
import { TEST_COURSE_PATH } from '../paths.js';

import {
  type EnrollmentAdmissionDecision,
  type EnrollmentAdmissionSource,
  selectEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
} from './identity.js';
import {
  OTHER_INSTITUTION_ID,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  selectEnrollments,
} from './test-utils.js';

interface AdmissionDecisionCase {
  expectedAllowed: boolean;
  expectedReason?: Extract<EnrollmentAdmissionDecision, { allowed: false }>['reason'];
  name: string;
  setup: (user: User) => Promise<EnrollmentAdmissionSource>;
}

interface BoundAdmissionDecisionCase {
  expectedAllowed: boolean;
  expectedReason?: Extract<EnrollmentAdmissionDecision, { allowed: false }>['reason'];
  isGuest: boolean;
  name: string;
  source: EnrollmentAdmissionSource;
  status: Enrollment['status'];
}

describe('enrollment identity selection and admission decisions', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let otherCourseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
    otherCourseInstance = await selectCourseInstanceById('2');
    await createInstitution(OTHER_INSTITUTION_ID, 'other.example', 'Other institution');
  });

  afterAll(helperDb.after);

  async function selectDecision({
    userId,
    source,
  }: {
    source: EnrollmentAdmissionSource;
    userId: string;
  }) {
    return await selectEnrollmentAdmissionDecision(
      {
        courseInstanceId: courseInstance.id,
        userId,
        lti13Identity:
          source.type === 'invitation' && source.matchedBy === 'lti13'
            ? {
                lti13CourseInstanceId: source.lti13CourseInstanceId,
                sub: source.sub,
              }
            : undefined,
      },
      source,
    );
  }

  it('keeps candidate selection read-only and scopes UIN and LTI provenance', async () => {
    const user = await createUser({ prefix: 'overlap' });
    const exactLink = await createLti13CourseInstance(courseInstance);
    const foreignLink = await createLti13CourseInstance(otherCourseInstance);
    const enrollment = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: user.uin,
      pendingLti13CourseInstanceId: exactLink.id,
      pendingLti13Sub: 'exact-sub',
    });
    const before = await selectEnrollments([enrollment.id]);

    const classification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      lti13Identity: {
        lti13CourseInstanceId: exactLink.id,
        sub: 'exact-sub',
      },
    });

    expect(classification.candidates).toEqual([
      expect.objectContaining({
        enrollment: expect.objectContaining({ id: enrollment.id }),
        matches: {
          boundUser: false,
          institutionUin: true,
          lti13: true,
          pendingUid: true,
        },
      }),
    ]);
    expect(classification.actionableUidInvitation).toBeNull();
    expect(classification.actionableInstitutionUinInvitation?.enrollment.id).toBe(enrollment.id);
    expect(await selectEnrollments([enrollment.id])).toEqual(before);

    await expect(
      selectDecision({
        userId: user.id,
        source: { type: 'invitation', matchedBy: 'uid' },
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'no_matching_invitation' });
    await expect(
      selectDecision({
        userId: user.id,
        source: { type: 'invitation', matchedBy: 'institution_uin' },
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      selectDecision({
        userId: user.id,
        source: {
          type: 'invitation',
          matchedBy: 'lti13',
          lti13CourseInstanceId: exactLink.id,
          sub: 'exact-sub',
        },
      }),
    ).resolves.toMatchObject({
      allowed: true,
      invitationCandidate: { enrollment: { id: enrollment.id } },
    });

    await expect(
      selectDecision({
        userId: user.id,
        source: {
          type: 'invitation',
          matchedBy: 'lti13',
          lti13CourseInstanceId: exactLink.id,
          sub: 'wrong-sub',
        },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'no_matching_invitation',
    });

    const foreignEnrollment = await createEnrollment({
      courseInstance,
      pendingUin: nextFixtureName('foreign-lti'),
      pendingLti13CourseInstanceId: foreignLink.id,
      pendingLti13Sub: 'foreign-sub',
    });
    const foreignClassification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      lti13Identity: {
        lti13CourseInstanceId: foreignLink.id,
        sub: 'foreign-sub',
      },
    });
    expect(
      foreignClassification.candidates.some(
        (candidate) => candidate.enrollment.id === foreignEnrollment.id,
      ),
    ).toBe(false);

    const sharedUin = nextFixtureName('institution-scope');
    const sameInstitutionUser = await createUser({ prefix: 'same-institution', uin: sharedUin });
    const otherInstitutionUser = await createUser({
      prefix: 'other-institution',
      uin: sharedUin,
      institutionId: OTHER_INSTITUTION_ID,
    });
    const scopedEnrollment = await createEnrollment({ courseInstance, pendingUin: sharedUin });
    expect(
      (
        await selectEnrollmentIdentityClassification({
          courseInstanceId: courseInstance.id,
          userId: sameInstitutionUser.id,
        })
      ).candidates[0].enrollment.id,
    ).toBe(scopedEnrollment.id);
    expect(
      (
        await selectEnrollmentIdentityClassification({
          courseInstanceId: courseInstance.id,
          userId: otherInstitutionUser.id,
        })
      ).candidates,
    ).toEqual([]);
  });

  it.each<AdmissionDecisionCase>([
    {
      name: 'allows a UID invitation',
      expectedAllowed: true,
      setup: async (user) => {
        await createEnrollment({ courseInstance, pendingUid: user.uid });
        return { type: 'invitation', matchedBy: 'uid' };
      },
    },
    {
      name: 'denies a rejected UID invitation',
      expectedAllowed: false,
      expectedReason: 'no_matching_invitation',
      setup: async (user) => {
        await createEnrollment({
          courseInstance,
          pendingUid: user.uid,
          status: 'rejected',
        });
        return { type: 'invitation', matchedBy: 'uid' };
      },
    },
    {
      name: 'allows an institution UIN invitation',
      expectedAllowed: true,
      setup: async (user) => {
        await createEnrollment({ courseInstance, pendingUin: user.uin });
        return { type: 'invitation', matchedBy: 'institution_uin' };
      },
    },
    {
      name: 'denies a guest institution UIN invitation',
      expectedAllowed: false,
      expectedReason: 'guest_state',
      setup: async (user) => {
        await createEnrollment({
          courseInstance,
          pendingUin: user.uin,
          isGuest: true,
        });
        return { type: 'invitation', matchedBy: 'institution_uin' };
      },
    },
    {
      name: 'allows an exact LTI invitation',
      expectedAllowed: true,
      setup: async (user) => {
        const exactLink = await createLti13CourseInstance(courseInstance);
        const source = {
          type: 'invitation' as const,
          matchedBy: 'lti13' as const,
          lti13CourseInstanceId: exactLink.id,
          sub: 'matrix-sub',
        };
        await createEnrollment({
          courseInstance,
          pendingUin: user.uin,
          pendingLti13CourseInstanceId: exactLink.id,
          pendingLti13Sub: source.sub,
        });
        return source;
      },
    },
  ])('$name', async ({ name, setup, expectedAllowed, expectedReason }) => {
    const user = await createUser({ prefix: name.replaceAll(' ', '-') });
    const source = await setup(user);
    const decision = await selectDecision({ userId: user.id, source });
    expect(decision).toMatchObject({
      allowed: expectedAllowed,
      ...(expectedReason === undefined ? {} : { reason: expectedReason }),
    });
  });

  it.each<BoundAdmissionDecisionCase>([
    {
      name: 'denies an already joined bound enrollment',
      status: 'joined',
      isGuest: false,
      source: { type: 'invitation', matchedBy: 'institution_uin' },
      expectedAllowed: false,
      expectedReason: 'already_joined',
    },
    {
      name: 'denies a blocked bound enrollment',
      status: 'blocked',
      isGuest: false,
      source: { type: 'self_enrollment' },
      expectedAllowed: false,
      expectedReason: 'blocked',
    },
    {
      name: 'allows a UIN invitation with a non-guest left enrollment',
      status: 'left',
      isGuest: false,
      source: { type: 'invitation', matchedBy: 'institution_uin' },
      expectedAllowed: true,
    },
    {
      name: 'denies a UIN invitation with a removed enrollment',
      status: 'removed',
      isGuest: false,
      source: { type: 'invitation', matchedBy: 'institution_uin' },
      expectedAllowed: false,
      expectedReason: 'non_actionable_bound_state',
    },
    {
      name: 'denies a UIN invitation with a guest left enrollment',
      status: 'left',
      isGuest: true,
      source: { type: 'invitation', matchedBy: 'institution_uin' },
      expectedAllowed: false,
      expectedReason: 'guest_state',
    },
  ])('$name', async ({ status, isGuest, source, expectedAllowed, expectedReason }) => {
    const user = await createUser({
      prefix: `bound-${status}-${isGuest}`,
    });
    await createEnrollment({
      courseInstance,
      userId: user.id,
      status,
      isGuest,
      firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    await createEnrollment({ courseInstance, pendingUin: user.uin });

    const decision = await selectDecision({ userId: user.id, source });
    expect(decision).toMatchObject({
      allowed: expectedAllowed,
      ...(expectedReason === undefined ? {} : { reason: expectedReason }),
    });
  });
});
