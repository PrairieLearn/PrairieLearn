import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type CourseInstance } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { createInstitution } from '../tests/utils/auth.js';

import { selectCourseInstanceById } from './course-instances.js';
import {
  selectEnrollmentAdmissionDecision,
  selectEnrollmentIdentityClassification,
  selectEnrollmentIdentityClassifications,
} from './enrollment-identity.js';
import {
  EnrollmentInvitationRequiredError,
  admitUserFromEnrollmentInvitation,
} from './enrollment-reconciliation.js';
import {
  OTHER_INSTITUTION_ID,
  checkedAdmissionFor,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  selectEnrollments,
} from './enrollment-reconciliation.test-helpers.js';

describe('enrollment identity full-set selection and decisions', { concurrent: false }, () => {
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

  it('is read-only, deduplicates overlapping keys, and preserves match provenance', async () => {
    const user = await createUser({ prefix: 'overlap' });
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const enrollment = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: user.uin,
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: 'overlap-sub',
      pendingName: 'Pending name',
      pendingEmail: 'pending@example.com',
    });
    const before = await selectEnrollments([enrollment.id]);

    const classification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      lti13Identity: {
        lti13CourseInstanceId: lti13CourseInstance.id,
        sub: 'overlap-sub',
      },
    });

    expect(classification.candidates).toHaveLength(1);
    expect(classification.candidates[0]).toMatchObject({
      enrollment: { id: enrollment.id },
      matches: {
        boundUser: false,
        institutionUin: true,
        lti13: true,
        pendingUid: true,
      },
    });
    expect(await selectEnrollments([enrollment.id])).toEqual(before);

    expect(classification.kind).toBe('actionable_roster_invitation');
    expect(classification.conventionalInvitationCandidates).toHaveLength(1);
    expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
    expect(classification.lti13RosterInvitationCandidates).toHaveLength(1);

    const classifications = await selectEnrollmentIdentityClassifications({
      courseInstanceIds: [courseInstance.id, otherCourseInstance.id],
      userId: user.id,
    });
    expect(classifications.get(courseInstance.id)).toMatchObject({
      candidates: [
        {
          enrollment: { id: enrollment.id },
          matches: {
            boundUser: false,
            institutionUin: true,
            lti13: false,
            pendingUid: true,
          },
        },
      ],
    });
    expect(classifications.get(otherCourseInstance.id)?.kind).toBe('none');
  });

  it('keeps conventional pending-UID invitations distinct from roster authorization', async () => {
    const user = await createUser({ prefix: 'conventional' });
    await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: nextFixtureName('unrelated-uin'),
    });

    const classification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
    });

    expect(classification.kind).toBe('actionable_conventional_invitation');
    expect(classification.conventionalInvitationCandidates).toHaveLength(1);
    expect(classification.rosterInvitationCandidates).toHaveLength(0);
  });

  it('pins conventional authority to the expected enrollment and preserves guest invitations', async () => {
    const user = await createUser({ prefix: 'pinned-conventional-guest' });
    const conventionalInvitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      isGuest: true,
    });
    const rosterInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const context = { courseInstanceId: courseInstance.id, userId: user.id };

    expect(
      await selectEnrollmentAdmissionDecision(
        context,
        { type: 'pending_uid' },
        {
          expectedInvitationEnrollmentId: conventionalInvitation.id,
        },
      ),
    ).toMatchObject({
      allowed: true,
      invitationCandidate: { enrollment: { id: conventionalInvitation.id, is_guest: true } },
    });
    expect(
      await selectEnrollmentAdmissionDecision(
        context,
        { type: 'pending_uid' },
        {
          expectedInvitationEnrollmentId: rosterInvitation.id,
        },
      ),
    ).toEqual({
      allowed: false,
      reason: 'no_matching_invitation',
      source: { type: 'pending_uid' },
    });

    const admitted = await admitUserFromEnrollmentInvitation({
      courseInstanceId: courseInstance.id,
      expectedInvitationEnrollmentId: conventionalInvitation.id,
      userId: user.id,
      source: { type: 'pending_uid' },
      ...checkedAdmissionFor(user),
    });
    expect(admitted).toMatchObject({
      id: conventionalInvitation.id,
      is_guest: true,
      status: 'joined',
    });
    expect(await selectEnrollments([conventionalInvitation.id, rosterInvitation.id])).toEqual([
      admitted,
    ]);
  });

  it('scopes pending UIN matches to the course institution', async () => {
    const sharedUin = nextFixtureName('institution-uin');
    const sameInstitutionUser = await createUser({
      prefix: 'same-institution',
      uin: sharedUin,
    });
    const otherInstitutionUser = await createUser({
      prefix: 'other-institution',
      uin: sharedUin,
      institutionId: OTHER_INSTITUTION_ID,
    });
    const enrollment = await createEnrollment({
      courseInstance,
      pendingUin: sharedUin,
    });

    const sameInstitutionClassification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: sameInstitutionUser.id,
    });
    expect(sameInstitutionClassification.candidates).toHaveLength(1);
    expect(sameInstitutionClassification.candidates[0]).toMatchObject({
      enrollment: { id: enrollment.id },
      matches: { institutionUin: true },
    });

    expect(
      (
        await selectEnrollmentIdentityClassification({
          courseInstanceId: courseInstance.id,
          userId: otherInstitutionUser.id,
        })
      ).candidates,
    ).toHaveLength(0);
  });

  it('requires exact LTI link ownership and source provenance', async () => {
    const user = await createUser({ prefix: 'lti-source' });
    const expectedLink = await createLti13CourseInstance(courseInstance);
    const otherLink = await createLti13CourseInstance(courseInstance);
    const foreignLink = await createLti13CourseInstance(otherCourseInstance);
    const enrollment = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      pendingUin: user.uin,
      pendingLti13CourseInstanceId: expectedLink.id,
      pendingLti13Sub: 'expected-sub',
    });

    for (const source of [
      {
        lti13CourseInstanceId: expectedLink.id,
        sub: 'wrong-sub',
      },
      {
        lti13CourseInstanceId: otherLink.id,
        sub: 'expected-sub',
      },
    ]) {
      const classification = await selectEnrollmentIdentityClassification({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        lti13Identity: source,
      });
      expect(classification.candidates).toHaveLength(1);
      expect(classification.candidates[0]).toMatchObject({
        enrollment: { id: enrollment.id },
        matches: { institutionUin: true, lti13: false, pendingUid: true },
      });
      expect(classification.lti13RosterInvitationCandidates).toHaveLength(0);
      expect(
        await selectEnrollmentAdmissionDecision(
          {
            courseInstanceId: courseInstance.id,
            userId: user.id,
            lti13Identity: source,
          },
          { type: 'lti13', ...source },
        ),
      ).toEqual({
        allowed: false,
        reason: 'no_matching_invitation',
        source: { type: 'lti13', ...source },
      });
      expect(
        await selectEnrollmentAdmissionDecision(
          {
            courseInstanceId: courseInstance.id,
            userId: user.id,
            lti13Identity: source,
          },
          { type: 'institution_uin' },
        ),
      ).toMatchObject({
        allowed: true,
        source: { type: 'institution_uin' },
      });
      await expect(
        admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'lti13', ...source },
          ...checkedAdmissionFor(user),
        }),
      ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
    }

    const foreignEnrollment = await createEnrollment({
      courseInstance,
      pendingUin: nextFixtureName('foreign-link-uin'),
      pendingLti13CourseInstanceId: foreignLink.id,
      pendingLti13Sub: 'foreign-sub',
    });
    expect(
      (
        await selectEnrollmentIdentityClassification({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          lti13Identity: {
            lti13CourseInstanceId: foreignLink.id,
            sub: 'foreign-sub',
          },
        })
      ).candidates,
    ).not.toContainEqual(
      expect.objectContaining({
        enrollment: expect.objectContaining({ id: foreignEnrollment.id }),
      }),
    );

    const exactClassification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
      lti13Identity: {
        lti13CourseInstanceId: expectedLink.id,
        sub: 'expected-sub',
      },
    });
    expect(exactClassification.candidates[0].matches.lti13).toBe(true);
  });

  it('does not treat bound left, removed, blocked, or guest rows as roster authorization', async () => {
    for (const status of ['left', 'removed', 'blocked'] as const) {
      const user = await createUser({ prefix: `ordinary-${status}` });
      await createEnrollment({
        courseInstance,
        userId: user.id,
        status,
        firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
      });
      const classification = await selectEnrollmentIdentityClassification({
        courseInstanceId: courseInstance.id,
        userId: user.id,
      });
      expect(classification.rosterInvitationCandidates).toHaveLength(0);
      expect(classification.kind).toBe(status === 'blocked' ? 'blocked' : 'ordinary');
    }

    const guestUser = await createUser({ prefix: 'guest-roster' });
    await createEnrollment({
      courseInstance,
      pendingUin: guestUser.uin,
      isGuest: true,
    });
    const guestClassification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: guestUser.id,
    });
    expect(guestClassification.rosterInvitationCandidates).toHaveLength(0);
    expect(guestClassification.kind).toBe('ordinary');
  });

  it('vetoes roster actionability for bound joined, bound removed, bound guest, and any guest candidate', async () => {
    for (const boundState of [
      { denialReason: 'already_joined', isGuest: false, status: 'joined' as const },
      {
        denialReason: 'non_actionable_bound_state',
        isGuest: false,
        status: 'removed' as const,
      },
      { denialReason: 'guest_state', isGuest: true, status: 'left' as const },
    ]) {
      const user = await createUser({
        prefix: `roster-veto-${boundState.status}-${boundState.isGuest}`,
      });
      const bound = await createEnrollment({
        courseInstance,
        userId: user.id,
        status: boundState.status,
        isGuest: boundState.isGuest,
        firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
      });
      const invitation = await createEnrollment({
        courseInstance,
        pendingUin: user.uin,
      });
      const classification = await selectEnrollmentIdentityClassification({
        courseInstanceId: courseInstance.id,
        userId: user.id,
      });

      expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
      expect(classification.actionableInstitutionRosterInvitationCandidates).toHaveLength(0);
      expect(
        await selectEnrollmentAdmissionDecision(
          { courseInstanceId: courseInstance.id, userId: user.id },
          { type: 'institution_uin' },
        ),
      ).toMatchObject({
        allowed: false,
        reason: boundState.denialReason,
      });
      const admission = admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        ...checkedAdmissionFor(user),
      });
      const admissionOutcome = await admission.then(
        (enrollment) => ({ enrollment, type: 'resolved' as const }),
        (error: unknown) => ({ error, type: 'rejected' as const }),
      );
      expect(admissionOutcome.type).toBe(boundState.status === 'joined' ? 'resolved' : 'rejected');
      expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(2);
    }

    const user = await createUser({ prefix: 'roster-veto-separate-guest' });
    const rosterInvitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const guestCandidate = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
      isGuest: true,
    });
    const classification = await selectEnrollmentIdentityClassification({
      courseInstanceId: courseInstance.id,
      userId: user.id,
    });

    expect(classification.institutionRosterInvitationCandidates).toHaveLength(1);
    expect(classification.actionableInstitutionRosterInvitationCandidates).toHaveLength(0);
    expect(
      await selectEnrollmentAdmissionDecision(
        { courseInstanceId: courseInstance.id, userId: user.id },
        { type: 'institution_uin' },
      ),
    ).toMatchObject({
      allowed: false,
      reason: 'guest_state',
    });
    await expect(
      admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        ...checkedAdmissionFor(user),
      }),
    ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
    expect(await selectEnrollments([rosterInvitation.id, guestCandidate.id])).toHaveLength(2);
  });

  it('does not make a bound left or removed enrollment conventionally actionable', async () => {
    for (const status of ['left', 'removed'] as const) {
      const user = await createUser({ prefix: `conventional-bound-${status}` });
      const bound = await createEnrollment({
        courseInstance,
        userId: user.id,
        status,
        firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
      });
      const invitation = await createEnrollment({
        courseInstance,
        pendingUid: user.uid,
      });
      const classification = await selectEnrollmentIdentityClassification({
        courseInstanceId: courseInstance.id,
        userId: user.id,
      });

      expect(classification.conventionalInvitationCandidates).toHaveLength(1);
      expect(classification.actionableConventionalInvitationCandidates).toHaveLength(0);
      expect(
        await selectEnrollmentAdmissionDecision(
          { courseInstanceId: courseInstance.id, userId: user.id },
          { type: 'pending_uid' },
        ),
      ).toMatchObject({
        allowed: false,
        reason: 'non_actionable_bound_state',
      });
      await expect(
        admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'pending_uid' },
          ...checkedAdmissionFor(user),
        }),
      ).rejects.toBeInstanceOf(EnrollmentInvitationRequiredError);
      expect(await selectEnrollments([bound.id, invitation.id])).toHaveLength(2);
    }
  });
});
