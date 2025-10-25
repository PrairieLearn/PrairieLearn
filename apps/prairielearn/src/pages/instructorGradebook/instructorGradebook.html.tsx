import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/preact/server';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledStylesheetTag } from '../../lib/assets.js';

import { InstructorGradebookTable } from './components/InstructorGradebookTable.js';
import { type CourseAssessmentRow, type GradebookRow } from './instructorGradebook.types.js';

export function InstructorGradebook({
  resLocals,
  csvFilename,
  courseAssessments,
  gradebookRows,
  search,
}: {
  resLocals: Record<string, any>;
  csvFilename: string;
  courseAssessments: CourseAssessmentRow[];
  gradebookRows: GradebookRow[];
  search: string;
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
      fullHeight: true,
    },
    headContent: html` ${compiledStylesheetTag('tanstackTable.css')} `,
    content: (
      <>
        <CourseInstanceSyncErrorsAndWarnings
          authzData={authz_data}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={urlPrefix}
        />
        <Hydrate fullHeight>
          <InstructorGradebookTable
            authzData={authz_data}
            csrfToken={__csrf_token}
            courseAssessments={courseAssessments}
            gradebookRows={gradebookRows}
            urlPrefix={urlPrefix}
            csvFilename={csvFilename}
            search={search}
            isDevMode={process.env.NODE_ENV === 'development'}
          />
        </Hydrate>
      </>
    ),
    postContent: [RoleDescriptionModal()],
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
