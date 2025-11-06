import { z } from 'zod';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { setCookieClient } from '../../../lib/client/cookie.js';
import {
  StaffCourseInstanceSchema,
  StaffEnrollmentSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';

interface OverviewCardProps {
  student: UserDetail;
  courseInstanceUrl: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  enrollmentManagementEnabled: boolean;
}

export const UserDetailSchema = z.object({
  user: StaffUserSchema.nullable(),
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema,
  role: z.enum(['None', 'Student', 'Staff']),
});

export type UserDetail = z.infer<typeof UserDetailSchema>;

export function OverviewCard({
  student,
  courseInstanceUrl,
  csrfToken,
  hasCourseInstancePermissionEdit,
  enrollmentManagementEnabled,
}: OverviewCardProps) {
  const { user, enrollment, role } = student;
  const handleViewAsStudent = () => {
    if (!user) throw new Error('User is required');
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/assessments`;
  };

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1 class="mb-0">Details</h1>
        {user && enrollment.status === 'joined' && (
          <button
            type="button"
            class="btn btn-sm btn-light d-flex flex-row align-items-center gap-1"
            onClick={handleViewAsStudent}
          >
            <i class="fas fa-user-graduate" aria-hidden="true" />
            <span>View as student</span>
          </button>
        )}
      </div>
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row mb-2 mb-md-0 align-items-md-center justify-content-between">
          <h2 class="d-flex align-items-center">
            {user?.name ?? enrollment.pending_uid}
            {enrollment.status !== 'joined' && (
              <EnrollmentStatusIcon type="badge" class="ms-2 fs-6" status={enrollment.status} />
            )}
          </h2>
          {hasCourseInstancePermissionEdit && enrollmentManagementEnabled && (
            <div class="d-flex gap-2 align-items-center">
              {enrollment.status === 'joined' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="block_student" />
                  <button
                    type="submit"
                    class="btn btn-sm btn-outline-danger d-flex flex-row align-items-center gap-1"
                  >
                    <i class="fas fa-user-slash" aria-hidden="true" />
                    <span>Block student</span>
                  </button>
                </form>
              )}
              {enrollment.status === 'blocked' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="unblock_student" />
                  <button
                    type="submit"
                    class="btn btn-sm btn-outline-success d-flex flex-row align-items-center gap-1"
                  >
                    <i class="fas fa-user-check" aria-hidden="true" />
                    <span>Remove block</span>
                  </button>
                </form>
              )}
              {enrollment.status === 'invited' && (
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary d-flex flex-row align-items-center gap-1"
                  data-bs-toggle="modal"
                  data-bs-target="#cancelInvitationModal"
                >
                  <i class="fas fa-times" aria-hidden="true" />
                  <span>Cancel invitation</span>
                </button>
              )}
              {enrollment.status === 'removed' && (
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="__action" value="invite_student" />
                  <button
                    type="submit"
                    class="btn btn-sm btn-outline-primary d-flex flex-row align-items-center gap-1"
                  >
                    <i class="fas fa-user-plus" aria-hidden="true" />
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
                    class="btn btn-sm btn-outline-primary d-flex flex-row align-items-center gap-1"
                  >
                    <i class="fas fa-user-plus" aria-hidden="true" />
                    <span>Re-invite student</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
        {user ? (
          <>
            <div class="d-flex">
              <div class="fw-bold me-1">UID:</div>
              {user.uid}
            </div>
            {user.uin && (
              <div class="d-flex">
                <div class="fw-bold me-1">UIN:</div> {user.uin}
              </div>
            )}
            <div class="d-flex">
              <div class="fw-bold me-1">Role:</div> {role}
            </div>
          </>
        ) : (
          <>
            <div class="d-flex">
              <div class="me-1">
                <i class="bi bi-warning" aria-hidden="true" />
                User information not available if the student has not accepted the invitation.
              </div>
            </div>
          </>
        )}
        {enrollment.first_joined_at && (
          <div class="d-flex">
            <div class="fw-bold me-1">First joined:</div>
            <FriendlyDate date={enrollment.first_joined_at} />
          </div>
        )}
      </div>

      <div
        class="modal fade"
        id="cancelInvitationModal"
        tabIndex={-1}
        role="dialog"
        aria-labelledby="cancelInvitationModalLabel"
      >
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h4" id="cancelInvitationModalLabel">
                Confirm cancel invitation
              </h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>
            <div class="modal-body">
              <p>
                The student will no longer appear in your course and any progress they have made on
                assessments will be lost.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <form method="POST" class="d-inline">
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <input type="hidden" name="__action" value="cancel_invitation" />
                <button type="submit" class="btn btn-danger">
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
