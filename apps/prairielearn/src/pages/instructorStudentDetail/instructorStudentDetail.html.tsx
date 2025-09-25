import z from 'zod';

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

import { OverviewCard } from './components/OverviewCard.js';
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
  const { user, course_instance } = student;

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

  const handleViewGradebookAsStudent = () => {
    if (!user) throw new Error('User is required');
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/gradebook`;
  };

  return (
    <TimezoneContext value={course_instance.display_timezone}>
      <div class="container-fluid">
        <OverviewCard
          student={student}
          courseInstanceUrl={courseInstanceUrl}
          csrfToken={csrfToken}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit ?? false}
          enrollmentManagementEnabled={enrollmentManagementEnabled}
        />

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
