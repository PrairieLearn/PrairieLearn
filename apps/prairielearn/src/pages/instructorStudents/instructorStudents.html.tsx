import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type User } from '../../lib/db-types.js';
import { renderHtml } from '../../lib/preact-html.js';

import { StudentsTable } from './StudentsTable.js';
import { type StudentRow } from './instructorStudents.types.js';

export function InstructorStudents({
  resLocals,
  courseOwners,
  csvFilename,
  students,
}: {
  resLocals: Record<string, any>;
  courseOwners: User[];
  csvFilename: string;
  students?: StudentRow[];
}) {
  const { authz_data, urlPrefix } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Students',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'students',
    },
    options: {
      fullWidth: true,
    },
    headContent: html``,
    content: html`
      ${CourseInstanceSyncErrorsAndWarnings({
        authz_data,
        courseInstance: resLocals.course_instance,
        course: resLocals.course,
        urlPrefix,
      })}
      ${!authz_data.has_course_instance_permission_view
        ? StudentDataViewMissing({
            courseOwners,
            hasCoursePermissionOwn: authz_data.has_course_permission_own,
            urlPrefix,
          })
        : html`
            <div class="card mb-4">
              <div class="card-header bg-primary text-white">
                <div class="d-flex justify-content-between align-items-center">
                  <h1>Students</h1>
                  <div>
                    <a
                      href="${urlPrefix}/instance_admin/students/${csvFilename}"
                      class="btn btn-light btn-sm"
                    >
                      <i class="fa fa-download" aria-hidden="true"></i>
                      Download CSV
                    </a>
                  </div>
                </div>
              </div>

              <div class="card-body">
                ${renderHtml(<StudentsTable students={students ?? []} />)}
              </div>
            </div>
            ${RoleDescriptionModal()}
          `}
    `,
  });
}

function StudentDataViewMissing({
  courseOwners,
  hasCoursePermissionOwn,
  urlPrefix,
}: {
  courseOwners: any[];
  hasCoursePermissionOwn: boolean;
  urlPrefix: string;
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-danger text-white">
        <h1>Students</h1>
      </div>
      <div class="card-body">
        <h2>Insufficient permissions</h2>
        <p>You must have permission to view student data in order to access the students list.</p>
        ${hasCoursePermissionOwn
          ? html`
              <p>
                You can grant yourself access to student data on the course's
                <a href="${urlPrefix}/course_admin/staff">Staff tab</a>.
              </p>
            `
          : courseOwners.length > 0
            ? html`
                <p>Contact one of the below course owners to request access.</p>
                <ul>
                  ${courseOwners.map(
                    (owner) => html`<li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li>`,
                  )}
                </ul>
              `
            : ''}
      </div>
    </div>
  `;
}

function RoleDescriptionModal() {
  return Modal({
    id: 'role-help',
    title: 'Roles',
    form: false,
    body: html`
      <ul>
        <li>
          <strong>Staff</strong> is a member of the course staff. Depending on course settings, they
          may have permission to see the data of all users, and to edit the information of other
          users.
        </li>
        <li>
          <strong>Student</strong> is a student participating in the class. They can only see their
          own information, and can do assessments.
        </li>
        <li>
          <strong>None</strong> is a user who at one point was part of the course but is no longer
          enrolled in the course or part of the staff. They can no longer access the course but
          their work done within the course has been retained.
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}
