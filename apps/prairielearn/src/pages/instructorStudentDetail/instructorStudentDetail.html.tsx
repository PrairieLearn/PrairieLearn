import { useState } from 'react';
import z from 'zod';

import { TimezoneContext } from '../../components/FriendlyDate.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import {
  type StaffAuditEvent,
  StaffCourseInstanceSchema,
  StaffEnrollmentSchema,
  type StaffStudentLabel,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';
import { SprocUsersGetDisplayedRoleSchema } from '../../lib/db-types.js';
import { type StaffGradebookRow } from '../../lib/gradebook.shared.js';

import { OverviewCard } from './components/OverviewCard.js';
import {
  StudentEnrollmentAuditEventsTable,
  StudentLabelAuditEventsTable,
} from './components/StudentAuditEventsTable.js';
import { StudentGradebookTable } from './components/StudentGradebookTable.js';

export const UserDetailSchema = z.object({
  user: StaffUserSchema.nullable(),
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema,
  role: SprocUsersGetDisplayedRoleSchema,
});

type UserDetail = z.infer<typeof UserDetailSchema>;

interface StudentDetailProps {
  enrollmentAuditEvents: StaffAuditEvent[];
  labelAuditEvents: StaffAuditEvent[];
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  studentLabels: StaffStudentLabel[];
  availableStudentLabels: StaffStudentLabel[];
  urlPrefix: string;
  courseInstanceUrl: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit?: boolean;
  hasModernPublishing: boolean;
}

type AuditTab = 'enrollment' | 'labels';

export function InstructorStudentDetail({
  enrollmentAuditEvents,
  labelAuditEvents,
  gradebookRows,
  student,
  studentLabels,
  availableStudentLabels,
  urlPrefix,
  courseInstanceUrl,
  csrfToken,
  hasCourseInstancePermissionEdit,
  hasModernPublishing,
}: StudentDetailProps) {
  const { user, course_instance } = student;
  const [activeTab, setActiveTab] = useState<AuditTab>('enrollment');

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
        studentLabels={studentLabels}
        availableStudentLabels={availableStudentLabels}
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
        <div className="card-header bg-primary text-white">
          <h2 className="mb-0">Audit events</h2>
        </div>
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${activeTab === 'enrollment' ? 'active' : ''}`}
                onClick={() => setActiveTab('enrollment')}
              >
                Enrollment
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${activeTab === 'labels' ? 'active' : ''}`}
                onClick={() => setActiveTab('labels')}
              >
                Labels
              </button>
            </li>
          </ul>
        </div>
        {activeTab === 'enrollment' ? (
          <StudentEnrollmentAuditEventsTable events={enrollmentAuditEvents} />
        ) : (
          <StudentLabelAuditEventsTable events={labelAuditEvents} />
        )}
      </div>
    </TimezoneContext>
  );
}

InstructorStudentDetail.displayName = 'InstructorStudentDetail';
