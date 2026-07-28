import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type CourseInstance } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { createInstitution } from '../tests/utils/auth.js';

import { selectCourseInstanceById } from './course-instances.js';
import {
  type EnrollmentAdmissionSource,
  selectEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
} from './enrollment-identity.js';
import {
  OTHER_INSTITUTION_ID,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  selectEnrollments,
} from './enrollment-reconciliation.test-helpers.js';

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
          source.type === 'lti13'
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
    expect(classification.actionableConventionalInvitation).toBeNull();
    expect(classification.actionableInstitutionRosterInvitation?.enrollment.id).toBe(enrollment.id);
    expect(await selectEnrollments([enrollment.id])).toEqual(before);

    await expect(
      selectDecision({ userId: user.id, source: { type: 'pending_uid' } }),
    ).resolves.toMatchObject({ allowed: false, reason: 'no_matching_invitation' });
    await expect(
      selectDecision({ userId: user.id, source: { type: 'institution_uin' } }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      selectDecision({
        userId: user.id,
        source: {
          type: 'lti13',
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
          type: 'lti13',
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

  it('table-drives pending source and status policy', async () => {
    const exactLink = await createLti13CourseInstance(courseInstance);
    const cases: {
      expectedAllowed: boolean;
      expectedReason?: string;
      name: string;
      setup: (user: Awaited<ReturnType<typeof createUser>>) => Promise<void>;
      source: EnrollmentAdmissionSource;
    }[] = [
      {
        name: 'conventional invitation',
        source: { type: 'pending_uid' },
        expectedAllowed: true,
        setup: async (user) => {
          await createEnrollment({ courseInstance, pendingUid: user.uid });
        },
      },
      {
        name: 'rejected conventional row',
        source: { type: 'pending_uid' },
        expectedAllowed: false,
        expectedReason: 'no_matching_invitation',
        setup: async (user) => {
          await createEnrollment({
            courseInstance,
            pendingUid: user.uid,
            status: 'rejected',
          });
        },
      },
      {
        name: 'institution roster invitation',
        source: { type: 'institution_uin' },
        expectedAllowed: true,
        setup: async (user) => {
          await createEnrollment({ courseInstance, pendingUin: user.uin });
        },
      },
      {
        name: 'guest roster row',
        source: { type: 'institution_uin' },
        expectedAllowed: false,
        expectedReason: 'guest_state',
        setup: async (user) => {
          await createEnrollment({
            courseInstance,
            pendingUin: user.uin,
            isGuest: true,
          });
        },
      },
      {
        name: 'exact LTI invitation',
        source: {
          type: 'lti13',
          lti13CourseInstanceId: exactLink.id,
          sub: 'matrix-sub',
        },
        expectedAllowed: true,
        setup: async (user) => {
          await createEnrollment({
            courseInstance,
            pendingUin: user.uin,
            pendingLti13CourseInstanceId: exactLink.id,
            pendingLti13Sub: 'matrix-sub',
          });
        },
      },
    ];

    for (const testCase of cases) {
      const user = await createUser({ prefix: testCase.name.replaceAll(' ', '-') });
      await testCase.setup(user);
      const decision = await selectDecision({ userId: user.id, source: testCase.source });
      expect(decision).toMatchObject({
        allowed: testCase.expectedAllowed,
        ...(testCase.expectedReason === undefined ? {} : { reason: testCase.expectedReason }),
      });
    }
  });

  it('table-drives bound and guest revalidation policy', async () => {
    const cases = [
      {
        status: 'joined' as const,
        isGuest: false,
        source: { type: 'institution_uin' as const },
        allowed: false,
        reason: 'already_joined',
      },
      {
        status: 'blocked' as const,
        isGuest: false,
        source: { type: 'ordinary' as const },
        allowed: false,
        reason: 'blocked',
      },
      {
        status: 'left' as const,
        isGuest: false,
        source: { type: 'institution_uin' as const },
        allowed: true,
      },
      {
        status: 'removed' as const,
        isGuest: false,
        source: { type: 'institution_uin' as const },
        allowed: false,
        reason: 'non_actionable_bound_state',
      },
      {
        status: 'left' as const,
        isGuest: true,
        source: { type: 'institution_uin' as const },
        allowed: false,
        reason: 'guest_state',
      },
    ];

    for (const testCase of cases) {
      const user = await createUser({
        prefix: `bound-${testCase.status}-${testCase.isGuest}`,
      });
      await createEnrollment({
        courseInstance,
        userId: user.id,
        status: testCase.status,
        isGuest: testCase.isGuest,
        firstJoinedAt: new Date('2024-01-01T00:00:00Z'),
      });
      await createEnrollment({ courseInstance, pendingUin: user.uin });

      const decision = await selectDecision({ userId: user.id, source: testCase.source });
      expect(decision).toMatchObject({
        allowed: testCase.allowed,
        ...('reason' in testCase ? { reason: testCase.reason } : {}),
      });
    }
  });
});
