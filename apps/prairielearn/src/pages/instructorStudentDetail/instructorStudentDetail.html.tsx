import { useState } from 'react';

import { TimezoneContext } from '../../components/FriendlyDate.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import { type StaffAuditEvent, type StaffStudentLabel } from '../../lib/client/safe-db-types.js';
import { type StaffGradebookRow } from '../../lib/gradebook.shared.js';
import { createCourseInstanceTrpcClient } from '../../trpc/courseInstance/client.js';

import { OverviewCard, type UserDetail } from './components/OverviewCard.js';
import { StudentAuditEventsTable } from './components/StudentAuditEventsTable.js';
import { StudentGradebookTable } from './components/StudentGradebookTable.js';

interface StudentDetailProps {
  auditEvents: StaffAuditEvent[];
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  studentLabels: StaffStudentLabel[];
  availableStudentLabels: StaffStudentLabel[];
  urlPrefix: string;
  courseInstanceUrl: string;
  courseInstanceId: string;
  csrfToken: string;
  trpcCsrfToken: string;
  hasCoursePermissionEdit?: boolean;
  hasCourseInstancePermissionEdit?: boolean;
  hasModernPublishing: boolean;
}

export function InstructorStudentDetail({
  auditEvents,
  gradebookRows,
  student,
  studentLabels: initialStudentLabels,
  availableStudentLabels: initialAvailableStudentLabels,
  urlPrefix,
  courseInstanceUrl,
  courseInstanceId,
  csrfToken,
  trpcCsrfToken,
  hasCoursePermissionEdit,
  hasCourseInstancePermissionEdit,
  hasModernPublishing,
}: StudentDetailProps) {
  const { user, course_instance } = student;
  const [trpcClient] = useState(() =>
    createCourseInstanceTrpcClient({ csrfToken: trpcCsrfToken, courseInstanceId }),
  );

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
        initialStudentLabels={initialStudentLabels}
        initialAvailableStudentLabels={initialAvailableStudentLabels}
        courseInstanceUrl={courseInstanceUrl}
        csrfToken={csrfToken}
        trpcClient={trpcClient}
        hasCoursePermissionEdit={hasCoursePermissionEdit ?? false}
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
          <h2 className="mb-0">Audit events</h2>
        </div>
        <StudentAuditEventsTable events={auditEvents} />
      </div>
    </TimezoneContext>
  );
}

InstructorStudentDetail.displayName = 'InstructorStudentDetail';
