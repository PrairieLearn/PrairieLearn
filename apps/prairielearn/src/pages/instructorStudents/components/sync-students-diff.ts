import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import type { SyncLabelUpdate } from '../instructorStudents.shared.js';

export interface StudentSyncItem {
  uid: string;
  currentStatus: EnumEnrollmentStatus | null;
  enrollmentId: string | null;
  name?: string | null;
  labelUpdate?: SyncLabelUpdate;
}

export interface SyncPreview {
  toInvite: StudentSyncItem[];
  toCancelInvitation: StudentSyncItem[];
  toRemove: StudentSyncItem[];
  toUpdateLabels: StudentSyncItem[];
  unchangedCount: number;
}

export interface SyncEnrollmentInfo {
  student_label_ids: string[];
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
 * - Students on list but not `joined`/`invited`: invite or re-enroll.
 * - Students not on list who are `joined`: remove.
 * - Students not on list who are `invited`/`rejected`: cancel invitation.
 */
export function computeSyncDiff(
  inputUids: string[],
  currentEnrollments: SyncEnrollmentInfo[],
  labelsByUid = new Map<string, string[] | undefined>(),
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
  const toUpdateLabels: StudentSyncItem[] = [];
  let unchangedCount = 0;

  for (const uid of inputUids) {
    const existing = currentUidMap.get(uid);
    const labelIds = labelsByUid.get(uid);
    const labelUpdate =
      labelIds === undefined
        ? undefined
        : {
            uid,
            expected: existing
              ? {
                  enrollmentId: existing.enrollment.id,
                  status: existing.enrollment.status,
                  labelIds: existing.student_label_ids,
                }
              : null,
            labelIds,
          };
    const item: StudentSyncItem = {
      uid,
      currentStatus: existing?.enrollment.status ?? null,
      enrollmentId: existing?.enrollment.id ?? null,
      name: existing?.user?.name,
      labelUpdate,
    };
    if (!existing || !['joined', 'invited'].includes(existing.enrollment.status)) {
      toInvite.push(item);
    } else if (
      labelUpdate &&
      (new Set(labelUpdate.labelIds).size !== new Set(existing.student_label_ids).size ||
        labelUpdate.labelIds.some((id) => !existing.student_label_ids.includes(id)))
    ) {
      toUpdateLabels.push(item);
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
        name: student.user?.name,
      };

      if (['invited', 'rejected'].includes(student.enrollment.status)) {
        toCancelInvitation.push(item);
      } else if (student.enrollment.status === 'joined') {
        toRemove.push(item);
      }
    }
  }

  return { toInvite, toCancelInvitation, toRemove, toUpdateLabels, unchangedCount };
}
