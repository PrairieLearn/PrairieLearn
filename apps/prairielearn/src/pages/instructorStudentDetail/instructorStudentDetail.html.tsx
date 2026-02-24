import { TimezoneContext } from '../../components/FriendlyDate.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import { type StaffAuditEvent } from '../../lib/client/safe-db-types.js';
import { type StaffGradebookRow } from '../../lib/gradebook.shared.js';

import { OverviewCard, type UserDetail } from './components/OverviewCard.js';
import { StudentAuditEventsTable } from './components/StudentAuditEventsTable.js';
import { StudentGradebookTable } from './components/StudentGradebookTable.js';

interface StudentDetailProps {
  auditEvents: StaffAuditEvent[];
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  urlPrefix: string;
  courseInstanceUrl: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit?: boolean;
  hasModernPublishing: boolean;
}

export function InstructorStudentDetail({
  auditEvents,
  gradebookRows,
  student,
  urlPrefix,
  courseInstanceUrl,
  csrfToken,
  hasCourseInstancePermissionEdit,
  hasModernPublishing,
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
      <OverviewCard
        student={student}
        courseInstanceUrl={courseInstanceUrl}
        csrfToken={csrfToken}
        hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit ?? false}
        hasModernPublishing={hasModernPublishing}
      />

      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h2 className="mb-0">Gradebook</h2>
          {user && (
            <button
              type="button"
              className="btn btn-sm btn-light d-flex flex-row align-items-center gap-1"
              onClick={handleViewGradebookAsStudent}
            >
              <i className="fas fa-book" aria-hidden="true" />
              <span>View gradebook as student</span>
            </button>
          )}
        </div>
        <StudentGradebookTable rows={gradebookRows} urlPrefix={urlPrefix} />
      </div>

      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h2 className="mb-0">Enrollment events</h2>
        </div>
        <StudentAuditEventsTable events={auditEvents} />
      </div>
    </TimezoneContext>
  );
}

InstructorStudentDetail.displayName = 'InstructorStudentDetail';
