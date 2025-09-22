import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';

import {
  type CourseAssessmentRow,
  type InstructorGradebookData,
} from './instructorGradebook.types.js';

export function InstructorGradebook({
  resLocals,
  csvFilename,
  courseAssessments,
}: {
  resLocals: Record<string, any>;
  csvFilename: string;
  courseAssessments: CourseAssessmentRow[];
}) {
  const { authz_data, urlPrefix, __csrf_token } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Gradebook',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'gradebook',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      <!-- Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
        from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way. -->
      <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
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
      ${compiledScriptTag('bootstrap-table-sticky-header.js')}
      ${compiledScriptTag('instructorGradebookClient.ts')}
      ${compiledStylesheetTag('instructorGradebook.css')}
      ${EncodedData<InstructorGradebookData>(
        {
          urlPrefix,
          csvFilename,
          csrfToken: __csrf_token,
          hasCourseInstancePermissionEdit: authz_data.has_course_instance_permission_edit,
          courseAssessments,
        },
        'gradebook-data',
      )}
    `,
    content: html`
      ${renderHtml(
        <CourseInstanceSyncErrorsAndWarnings
          authzData={authz_data}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>Gradebook</h1>
        </div>
        <table id="gradebook-table" aria-label="Gradebook"></table>

        <div class="spinning-wheel card-body spinner-border">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
      ${RoleDescriptionModal()}
    `,
  });
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
