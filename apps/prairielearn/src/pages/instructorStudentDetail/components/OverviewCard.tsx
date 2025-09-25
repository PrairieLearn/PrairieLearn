import { z } from 'zod';

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
}

export const UserDetailSchema = z.object({
  user: StaffUserSchema.nullable(),
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema,
  role: z.enum(['None', 'Student', 'Staff']),
});

export type UserDetail = z.infer<typeof UserDetailSchema>;

export function OverviewCard({ student, courseInstanceUrl }: OverviewCardProps) {
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
        {user && (
          <button type="button" class="btn btn-sm btn-light" onClick={handleViewAsStudent}>
            <i class="fas fa-user-graduate me-1" aria-hidden="true" />
            View as student
          </button>
        )}
      </div>
      <div class="card-body">
        <h2>{user?.name ?? enrollment.pending_uid}</h2>
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
          <div class="d-flex">
            <div class="me-1">
              <i class="bi bi-warning" aria-hidden="true" />
              User information not available if the student has not accepted the invitation.
            </div>
          </div>
        )}
        {enrollment?.created_at && (
          <div class="d-flex">
            <div class="fw-bold me-1">Enrolled:</div>
            <FriendlyDate date={enrollment.created_at} />
          </div>
        )}
      </div>
    </div>
  );
}
