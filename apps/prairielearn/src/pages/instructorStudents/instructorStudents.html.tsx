import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type User } from '../../lib/db-types.js';

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
    content: (
      <>
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: CourseInstanceSyncErrorsAndWarnings({
              authz_data,
              courseInstance: resLocals.course_instance,
              course: resLocals.course,
              urlPrefix,
            }).toString(),
          }}
        />
        {!authz_data.has_course_instance_permission_view ? (
          <StudentDataViewMissing
            courseOwners={courseOwners}
            hasCoursePermissionOwn={authz_data.has_course_permission_own}
            urlPrefix={urlPrefix}
          />
        ) : (
          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <div className="d-flex justify-content-between align-items-center">
                <h1>Students</h1>
                <div>
                  <a
                    href={`${urlPrefix}/instance_admin/students/${csvFilename}`}
                    className="btn btn-light btn-sm"
                  >
                    <i className="fa fa-download" aria-hidden="true"></i>
                    Download CSV
                  </a>
                </div>
              </div>
            </div>
            <div className="card-body">
              <StudentsTable students={students ?? []} />
            </div>
            <RoleDescriptionModal />
          </div>
        )}
      </>
    ),
  });
}

function StudentDataViewMissing({
  courseOwners,
  hasCoursePermissionOwn,
  urlPrefix,
}: {
  courseOwners: User[];
  hasCoursePermissionOwn: boolean;
  urlPrefix: string;
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-danger text-white">
        <h1>Students</h1>
      </div>
      <div className="card-body">
        <h2>Insufficient permissions</h2>
        <p>You must have permission to view student data in order to access the students list.</p>
        {hasCoursePermissionOwn ? (
          <p>
            You can grant yourself access to student data on the course's{' '}
            <a href={`${urlPrefix}/course_admin/staff`}>Staff tab</a>.
          </p>
        ) : courseOwners.length > 0 ? (
          <>
            <p>Contact one of the below course owners to request access.</p>
            <ul>
              {courseOwners.map((owner) => (
                <li key={owner.user_id}>
                  {owner.uid} {owner.name ? `(${owner.name})` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RoleDescriptionModal() {
  return (
    <div
      className="modal fade"
      id="role-help"
      tabIndex={-1}
      aria-labelledby="role-help-label"
      aria-hidden="true"
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="role-help-label">
              Roles
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            <ul>
              <li>
                <strong>Staff</strong> is a member of the course staff. Depending on course
                settings, they may have permission to see the data of all users, and to edit the
                information of other users.
              </li>
              <li>
                <strong>Student</strong> is a student participating in the class. They can only see
                their own information, and can do assessments.
              </li>
              <li>
                <strong>None</strong> is a user who at one point was part of the course but is no
                longer enrolled in the course or part of the staff. They can no longer access the
                course but their work done within the course has been retained.
              </li>
            </ul>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
