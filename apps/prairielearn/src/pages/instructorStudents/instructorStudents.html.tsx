import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type User } from '../../lib/db-types.js';

import { RoleDescriptionModal } from './components/RoleDescriptionModal.js';
import { StudentDataViewMissing } from './components/StudentDataViewMissing.js';
import { StudentsTable } from './components/StudentsTable.js';
import { type StudentRow } from './components/StudentsTable.js';

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
          // TODO: After #12197 use the component directly
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
