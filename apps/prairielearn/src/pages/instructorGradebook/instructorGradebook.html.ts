import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import { type User } from '../../lib/db-types.js';

import {
  type CourseAssessmentRow,
  type InstructorGradebookData,
} from './instructorGradebook.types.js';

export function InstructorGradebook({
  resLocals,
  courseOwners,
  csvFilename,
  courseAssessments,
}: {
  resLocals: Record<string, any>;
  courseOwners: User[];
  csvFilename: string;
  courseAssessments?: CourseAssessmentRow[];
}) {
  const { authz_data, urlPrefix, __csrf_token } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        <!-- Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
        from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way. -->
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/bootstrap-table.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.js',
          )}"></script>
        <link
          href="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.css')}"
          rel="stylesheet"
        />
        <link
          href="${nodeModulesAssetPath(
            'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.css',
          )}"
          rel="stylesheet"
        />
        ${compiledScriptTag('instructorGradebookClient.ts')}
        ${compiledStylesheetTag('instructorGradebook.css')}
        ${EncodedData<InstructorGradebookData>(
          {
            urlPrefix,
            csvFilename,
            csrfToken: __csrf_token,
            hasCourseInstancePermissionEdit: authz_data.has_course_instance_permission_edit,
            courseAssessments: courseAssessments ?? [],
          },
          'gradebook-data',
        )}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
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
                    <h1>Gradebook</h1>
                  </div>
                  <table id="gradebook-table" aria-label="Gradebook"></table>

                  <div class="spinning-wheel card-body spinner-border">
                    <span class="sr-only">Loading...</span>
                  </div>
                </div>
                ${RoleDescriptionModal()}
              `}
        </main>
      </body>
    </html>
  `.toString();
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
        <h1>Gradebook</h1>
      </div>
      <div class="card-body">
        <h2>Insufficient permissions</h2>
        <p>You must have permission to view student data in order to access the gradebook.</p>
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
      <button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>
    `,
  });
}
