import z from 'zod';

import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import {
  type Course,
  type CourseInstance,
  EnrollmentSchema,
  type User,
  UserSchema,
} from '../../lib/db-types.js';

import { StudentDataViewMissing } from './components/StudentDataViewMissing.js';
import { StudentsTable } from './components/StudentsTable.js';

export const StudentRowSchema = z.object({
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  email: UserSchema.shape.email,
  course_instance_id: EnrollmentSchema.shape.course_instance_id,
  created_at: EnrollmentSchema.shape.created_at,
});
export type StudentRow = z.infer<typeof StudentRowSchema>;

export interface ResLocals {
  authz_data: {
    has_course_instance_permission_edit: boolean;
    has_course_instance_permission_view: boolean;
    has_course_permission_own: boolean;
  };
  course_instance: CourseInstance;
  course: Course;
  urlPrefix: string;
}

interface InstructorStudentsContentProps {
  resLocals: ResLocals;
  courseOwners: User[];
  csvFilename: string;
  students: StudentRow[];
}

export const InstructorStudents = ({
  resLocals,
  courseOwners,
  csvFilename,
  students,
}: InstructorStudentsContentProps) => {
  const { authz_data, urlPrefix } = resLocals;

  return (
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
      {!authz_data.has_course_instance_permission_view && courseOwners ? (
        <StudentDataViewMissing
          courseOwners={courseOwners}
          hasCoursePermissionOwn={authz_data.has_course_permission_own}
          urlPrefix={urlPrefix}
        />
      ) : (
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <div className="d-flex justify-content-between align-items-center">
              <div>Students</div>
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
        </div>
      )}
    </>
  );
};
