import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';

export interface StudentSyncItem {
  uid: string;
  currentStatus: EnumEnrollmentStatus | null;
  enrollmentId: string | null;
  userName?: string | null;
}

export interface SyncPreview {
  toInvite: StudentSyncItem[];
  toCancelInvitation: StudentSyncItem[];
  toRemove: StudentSyncItem[];
  unchangedCount: number;
}

export interface SyncEnrollmentInfo {
  enrollment: {
    id: string;
    status: EnumEnrollmentStatus;
    pending_uid: string | null;
  };
  user: {
    uid: string;
    name: string | null;
  } | null;
}

/**
 * Computes the diff between the input student list and the current enrollments.
 *
 * Sync logic (student list is the source of truth):
 * - Students on list but not `joined`/`invited`/`lti13_pending`: invite or re-enroll.
 * - Students not on list who are `joined`: remove.
 * - Students not on list who are `invited`/`rejected`: cancel invitation.
 * - `lti13_pending` is intentionally non-actionable until LTI roster sync is supported.
 */
export function computeSyncDiff(
  inputUids: string[],
  currentEnrollments: SyncEnrollmentInfo[],
): SyncPreview {
  const inputUidSet = new Set(inputUids);
  const currentUidMap = new Map<string, SyncEnrollmentInfo>();

  for (const student of currentEnrollments) {
    const uid = student.user?.uid ?? student.enrollment.pending_uid;
    if (uid) {
      currentUidMap.set(uid, student);
    }
  }

  const toInvite: StudentSyncItem[] = [];
  const toCancelInvitation: StudentSyncItem[] = [];
  const toRemove: StudentSyncItem[] = [];
  let unchangedCount = 0;

  for (const uid of inputUids) {
    const existing = currentUidMap.get(uid);
    if (!existing) {
      toInvite.push({
        uid,
        currentStatus: null,
        enrollmentId: null,
      });
    } else if (!['joined', 'invited', 'lti13_pending'].includes(existing.enrollment.status)) {
      toInvite.push({
        uid: existing.user?.uid ?? existing.enrollment.pending_uid ?? uid,
        currentStatus: existing.enrollment.status,
        enrollmentId: existing.enrollment.id,
        userName: existing.user?.name,
      });
    } else {
      unchangedCount++;
    }
  }

  for (const student of currentUidMap.values()) {
    const uid = student.user?.uid ?? student.enrollment.pending_uid;
    if (uid && !inputUidSet.has(uid)) {
      const item: StudentSyncItem = {
        uid: student.user?.uid ?? student.enrollment.pending_uid ?? uid,
        currentStatus: student.enrollment.status,
        enrollmentId: student.enrollment.id,
        userName: student.user?.name,
      };

      if (['invited', 'rejected'].includes(student.enrollment.status)) {
        toCancelInvitation.push(item);
      } else if (student.enrollment.status === 'joined') {
        toRemove.push(item);
      }
    }
  }

  return { toInvite, toCancelInvitation, toRemove, unchangedCount };
}
