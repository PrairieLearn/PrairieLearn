import { useState } from 'react';
import { z } from 'zod';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import { StudentLabelDropdown } from '../../../components/StudentLabelDropdown.js';
import { setCookieClient } from '../../../lib/client/cookie.js';
import {
  StaffCourseInstanceSchema,
  StaffEnrollmentSchema,
  type StaffStudentLabel,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { getCourseInstanceStudentLabelsUrl } from '../../../lib/client/url.js';
import type { createCourseInstanceTrpcClient } from '../../../trpc/courseInstance/client.js';

type StudentLabelsTrpcClient = ReturnType<typeof createCourseInstanceTrpcClient>;

export const UserDetailSchema = z.object({
  user: StaffUserSchema.nullable(),
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema,
  role: z.enum(['None', 'Student', 'Staff']),
});

export type UserDetail = z.infer<typeof UserDetailSchema>;

export function OverviewCard({
  student,
  initialStudentLabels,
  initialAvailableStudentLabels,
  courseInstanceUrl,
  csrfToken,
  trpcClient,
  hasCourseInstancePermissionEdit,
  hasCoursePermissionEdit,
  hasModernPublishing,
}: {
  student: UserDetail;
  initialStudentLabels: StaffStudentLabel[];
  initialAvailableStudentLabels: StaffStudentLabel[];
  courseInstanceUrl: string;
  csrfToken: string;
  trpcClient: StudentLabelsTrpcClient;
  hasCourseInstancePermissionEdit: boolean;
  hasCoursePermissionEdit: boolean;
  hasModernPublishing: boolean;
}) {
  const { user, enrollment, role } = student;
  const [studentLabels, setStudentLabels] = useState(initialStudentLabels);
  const availableStudentLabels = initialAvailableStudentLabels;
  const [isLabelMutating, setIsLabelMutating] = useState(false);
  const canManageLabels = hasCoursePermissionEdit && hasCourseInstancePermissionEdit;
  const handleViewAsStudent = () => {
    if (!user) throw new Error('User is required');
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/assessments`;
  };

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1 className="mb-0">Details</h1>
        {user && enrollment.status === 'joined' && (
          <button
            type="button"
            className="btn btn-sm btn-light d-flex flex-row align-items-center gap-1"
            onClick={handleViewAsStudent}
          >
            <i className="fas fa-user-graduate" aria-hidden="true" />
            <span>View as student</span>
          </button>
        )}
      </div>
      <div className="card-body">
        <div className="d-flex flex-column flex-md-row mb-2 mb-md-0 align-items-md-center justify-content-between">
          <h2 className="d-flex align-items-center">
            {user?.name ?? enrollment.pending_uid}
            {enrollment.status !== 'joined' && (
              <EnrollmentStatusIcon type="badge" className="ms-2 fs-6" status={enrollment.status} />
            )}
          </h2>
          {hasCourseInstancePermissionEdit && hasModernPublishing && (
            <div className="d-flex gap-2 align-items-center">
              {enrollment.status === 'joined' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="block_student" />
                  <button
                    type="submit"
                    className="btn btn-sm btn-outline-danger d-flex flex-row align-items-center gap-1"
                  >
                    <i className="fas fa-user-slash" aria-hidden="true" />
                    <span>Block student</span>
                  </button>
                </form>
              )}
              {(enrollment.status === 'invited' || enrollment.status === 'rejected') && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary d-flex flex-row align-items-center gap-1"
                  data-bs-toggle="modal"
                  data-bs-target="#cancelInvitationModal"
                >
                  <i className="fas fa-times" aria-hidden="true" />
                  <span>Cancel invitation</span>
                </button>
              )}
              {enrollment.status === 'left' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="invite_student" />
                  <button
                    type="submit"
                    className="btn btn-sm btn-outline-primary d-flex flex-row align-items-center gap-1"
                  >
                    <i className="fas fa-user-plus" aria-hidden="true" />
                    <span>Invite student</span>
                  </button>
                </form>
              )}
              {enrollment.status === 'rejected' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="invite_student" />
                  <button
                    type="submit"
                    className="btn btn-sm btn-outline-primary d-flex flex-row align-items-center gap-1"
                  >
                    <i className="fas fa-user-plus" aria-hidden="true" />
                    <span>Re-invite student</span>
                  </button>
                </form>
              )}
              {(enrollment.status === 'removed' || enrollment.status === 'blocked') && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="reenroll_student" />
                  <button
                    type="submit"
                    className="btn btn-sm btn-outline-primary d-flex flex-row align-items-center gap-1"
                  >
                    <i className="fas fa-user-plus" aria-hidden="true" />
                    <span>Re-enroll student</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
        {user ? (
          <>
            <div className="d-flex">
              <div className="fw-bold me-1">UID:</div>
              {user.uid}
            </div>
            {user.uin && (
              <div className="d-flex">
                <div className="fw-bold me-1">UIN:</div> {user.uin}
              </div>
            )}
            <div className="d-flex">
              <div className="fw-bold me-1">Role:</div> {role}
            </div>
          </>
        ) : (
          <>
            <div className="d-flex">
              <div className="me-1">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                User information not available if the student has not accepted the invitation.
              </div>
            </div>
          </>
        )}
        {enrollment.first_joined_at && (
          <div className="d-flex">
            <div className="fw-bold me-1">First joined:</div>
            <FriendlyDate date={enrollment.first_joined_at} />
          </div>
        )}

        <div className="mt-3">
          <div className="fw-bold mb-2">Student labels</div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            {studentLabels.map((label) => (
              <StudentLabelBadge key={label.id} label={label}>
                {hasCourseInstancePermissionEdit && (
                  <button
                    type="button"
                    className="btn p-0 lh-1"
                    disabled={isLabelMutating}
                    aria-label={`Remove label "${label.name}"`}
                    onClick={async () => {
                      setIsLabelMutating(true);
                      try {
                        await trpcClient.studentLabels.batchRemove.mutate({
                          enrollmentIds: [enrollment.id],
                          labelId: label.id,
                        });
                        setStudentLabels((prev) => prev.filter((l) => l.id !== label.id));
                      } finally {
                        setIsLabelMutating(false);
                      }
                    }}
                  >
                    <i className="bi bi-x text-danger" aria-hidden="true" />
                  </button>
                )}
              </StudentLabelBadge>
            ))}
            {studentLabels.length === 0 && availableStudentLabels.length === 0 && (
              <span className="text-muted fst-italic">
                No labels configured.{' '}
                {canManageLabels && (
                  <a href={getCourseInstanceStudentLabelsUrl(student.course_instance.id)}>
                    Manage labels
                  </a>
                )}
              </span>
            )}
            {studentLabels.length === 0 && availableStudentLabels.length > 0 && (
              <span className="text-muted fst-italic">No labels</span>
            )}
            {hasCourseInstancePermissionEdit && availableStudentLabels.length > 0 && (
              <StudentLabelDropdown
                labels={availableStudentLabels}
                selectedIds={new Set(studentLabels.map((sl) => sl.id))}
                disabled={isLabelMutating}
                footer={
                  <a
                    className="dropdown-item"
                    href={getCourseInstanceStudentLabelsUrl(student.course_instance.id)}
                  >
                    <i className="bi bi-gear me-1" aria-hidden="true" />
                    {canManageLabels ? 'Manage labels' : 'View labels'}
                  </a>
                }
                onToggle={async (label) => {
                  const isSelected = studentLabels.some((sl) => sl.id === label.id);
                  setIsLabelMutating(true);
                  try {
                    if (isSelected) {
                      await trpcClient.studentLabels.batchRemove.mutate({
                        enrollmentIds: [enrollment.id],
                        labelId: label.id,
                      });
                      setStudentLabels((prev) => prev.filter((l) => l.id !== label.id));
                    } else {
                      await trpcClient.studentLabels.batchAdd.mutate({
                        enrollmentIds: [enrollment.id],
                        labelId: label.id,
                      });
                      setStudentLabels((prev) => [...prev, label]);
                    }
                  } finally {
                    setIsLabelMutating(false);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div
        className="modal fade"
        id="cancelInvitationModal"
        tabIndex={-1}
        role="dialog"
        aria-labelledby="cancelInvitationModalLabel"
      >
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h4" id="cancelInvitationModalLabel">
                Confirm cancel invitation
              </h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p>
                The student will no longer appear in your course and any progress they have made on
                assessments will be lost.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <form method="POST" className="d-inline">
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <input type="hidden" name="__action" value="cancel_invitation" />
                <button type="submit" className="btn btn-danger">
                  Cancel invitation
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
