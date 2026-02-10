import { describe, expect, it } from 'vitest';

import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';

import { type SyncEnrollmentInfo, computeSyncDiff } from './sync-students-diff.js';

function makeEnrollment({
  status,
  uid = null,
  pendingUid = null,
  name = null,
}: {
  status: EnumEnrollmentStatus;
  uid?: string | null;
  pendingUid?: string | null;
  name?: string | null;
}): SyncEnrollmentInfo {
  return {
    enrollment: {
      id: `${uid ?? pendingUid ?? status}-id`,
      status,
      pending_uid: pendingUid,
    },
    user: uid ? { uid, name } : null,
  };
}

describe('computeSyncDiff', () => {
  it('skips lti13_pending enrollments that are on the student list', () => {
    const diff = computeSyncDiff(
      ['lti-student@example.com'],
      [makeEnrollment({ status: 'lti13_pending', uid: 'lti-student@example.com' })],
    );

    expect(diff.toInvite).toEqual([]);
    expect(diff.toCancelInvitation).toEqual([]);
    expect(diff.toRemove).toEqual([]);
    expect(diff.unchangedCount).toBe(1);
  });

  it('skips lti13_pending enrollments that are not on the student list', () => {
    const diff = computeSyncDiff(
      [],
      [makeEnrollment({ status: 'lti13_pending', uid: 'lti-student@example.com' })],
    );

    expect(diff.toInvite).toEqual([]);
    expect(diff.toCancelInvitation).toEqual([]);
    expect(diff.toRemove).toEqual([]);
    expect(diff.unchangedCount).toBe(0);
  });

  it('still invites blocked and removed enrollments that are on the student list', () => {
    const diff = computeSyncDiff(
      ['blocked@example.com', 'removed@example.com'],
      [
        makeEnrollment({ status: 'blocked', uid: 'blocked@example.com' }),
        makeEnrollment({ status: 'removed', uid: 'removed@example.com' }),
      ],
    );

    expect(diff.toInvite).toEqual([
      {
        uid: 'blocked@example.com',
        currentStatus: 'blocked',
        enrollmentId: 'blocked@example.com-id',
        userName: null,
      },
      {
        uid: 'removed@example.com',
        currentStatus: 'removed',
        enrollmentId: 'removed@example.com-id',
        userName: null,
      },
    ]);
    expect(diff.toCancelInvitation).toEqual([]);
    expect(diff.toRemove).toEqual([]);
    expect(diff.unchangedCount).toBe(0);
  });

  it('counts unchanged students who are already joined or invited', () => {
    const diff = computeSyncDiff(
      ['joined@example.com', 'invited@example.com', 'new@example.com'],
      [
        makeEnrollment({ status: 'joined', uid: 'joined@example.com' }),
        makeEnrollment({ status: 'invited', uid: 'invited@example.com' }),
      ],
    );

    expect(diff.unchangedCount).toBe(2);
    expect(diff.toInvite).toHaveLength(1);
    expect(diff.toInvite[0].uid).toBe('new@example.com');
  });
});
