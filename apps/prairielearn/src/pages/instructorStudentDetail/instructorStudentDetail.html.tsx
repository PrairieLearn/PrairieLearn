import z from 'zod';

import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import { TimezoneContext } from '../../components/FriendlyDate.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import {
  type StaffAuditEvent,
  StaffCourseInstanceSchema,
  StaffEnrollmentSchema,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';
import { SprocUsersGetDisplayedRoleSchema } from '../../lib/db-types.js';
import { type StaffGradebookRow } from '../../lib/gradebook.shared.js';

import { StudentAuditEventsTable } from './components/StudentAuditEventsTable.js';
import { StudentGradebookTable } from './components/StudentGradebookTable.js';

export const UserDetailSchema = z.object({
  user: StaffUserSchema.nullable(),
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema,
  role: SprocUsersGetDisplayedRoleSchema,
});

type UserDetail = z.infer<typeof UserDetailSchema>;

interface StudentDetailProps {
  auditEvents: StaffAuditEvent[];
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  urlPrefix: string;
  courseInstanceUrl: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit?: boolean;
  enrollmentManagementEnabled: boolean;
}

export function InstructorStudentDetail({
  auditEvents,
  gradebookRows,
  student,
  urlPrefix,
  courseInstanceUrl,
  csrfToken,
  hasCourseInstancePermissionEdit,
  enrollmentManagementEnabled,
}: StudentDetailProps) {
  const { user, course_instance, enrollment, role } = student;

  const gradebookRowsBySet = new Map<string, StaffGradebookRow[]>();
  gradebookRows.forEach((row) => {
    const setHeading = row.assessment_set.heading;
    if (!gradebookRowsBySet.has(setHeading)) {
      gradebookRowsBySet.set(setHeading, []);
    }
    const setAssessments = gradebookRowsBySet.get(setHeading);
    if (setAssessments) {
      setAssessments.push(row);
    }
  });

  const handleViewAsStudent = () => {
    if (!user) throw new Error('User is required');
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/assessments`;
  };

  const handleViewGradebookAsStudent = () => {
    if (!user) throw new Error('User is required');
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/gradebook`;
  };

  return (
    <TimezoneContext value={course_instance.display_timezone}>
      <div class="container-fluid">
        <div class="card mb-4">
          <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
            <h1 class="mb-0">Details</h1>
            {user && (
              <button type="button" class="btn btn-sm btn-light" onClick={handleViewAsStudent}>
                <i class="fas fa-user-graduate me-1" aria-hidden="true" />
                View as student
              </button>
            )}
          </div>
          <div class="card-body">
            <div class="d-flex align-items-center justify-content-between">
              <h2 class="d-flex align-items-center">
                {user?.name ?? enrollment.pending_uid}
                <EnrollmentStatusIcon
                  class="badge bg-secondary ms-2 fs-6"
                  status={enrollment.status}
                />
              </h2>
              {hasCourseInstancePermissionEdit && enrollmentManagementEnabled && enrollment && (
                <div class="d-flex gap-2 align-items-center">
                  {enrollment.status === 'joined' && (
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value={csrfToken} />
                      <input type="hidden" name="__action" value="block_student" />
                      <button type="submit" class="btn btn-sm btn-outline-danger">
                        <i class="fas fa-user-slash me-1" aria-hidden="true" /> Block student
                      </button>
                    </form>
                  )}
                  {enrollment.status === 'blocked' && (
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value={csrfToken} />
                      <input type="hidden" name="__action" value="unblock_student" />
                      <button type="submit" class="btn btn-sm btn-outline-success">
                        <i class="fas fa-user-check me-1" aria-hidden="true" /> Remove block
                      </button>
                    </form>
                  )}
                  {enrollment.status === 'invited' && (
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value={csrfToken} />
                      <input type="hidden" name="__action" value="cancel_invitation" />
                      <button type="submit" class="btn btn-sm btn-outline-secondary">
                        <i class="fas fa-times me-1" aria-hidden="true" /> Cancel invitation
                      </button>
                    </form>
                  )}
                  {enrollment.status === 'rejected' && (
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value={csrfToken} />
                      <input type="hidden" name="__action" value="invite_student" />
                      <button type="submit" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-user-plus me-1" aria-hidden="true" /> Re-invite student
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
            {enrollment?.first_joined_at && (
              <div class="d-flex">
                <div class="fw-bold me-1">First joined:</div>
                <FriendlyDate
                  date={enrollment.first_joined_at}
                  timezone={course_instance.display_timezone}
                />
              </div>
            )}
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
            <h2 class="mb-0">Gradebook</h2>
            {user && (
              <button
                type="button"
                class="btn btn-sm btn-light"
                onClick={handleViewGradebookAsStudent}
              >
                <i class="fas fa-book me-1" aria-hidden="true" />
                View gradebook as student
              </button>
            )}
          </div>
          <StudentGradebookTable rows={gradebookRows} urlPrefix={urlPrefix} />
        </div>

        <div class="card mb-4">
          <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
            <h2 class="mb-0">Enrollment events</h2>
          </div>
          <StudentAuditEventsTable events={auditEvents} />
        </div>
      </div>
    </TimezoneContext>
  );
}

InstructorStudentDetail.displayName = 'InstructorStudentDetail';
