import { type SortingState } from '@tanstack/react-table';

import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import type { ResLocals } from '../../lib/client/res-locals.js';
import { type User } from '../../lib/db-types.js';

import { StudentDataViewMissing } from './components/StudentDataViewMissing.js';
import { StudentsCard } from './components/StudentsCard.js';
import { type StudentRow } from './instructorStudents.types.js';

export const InstructorStudents = ({
  resLocals,
  courseOwners,
  students,
  initialGlobalFilterValue,
  initialSortingValue,
}: {
  resLocals: ResLocals;
  courseOwners: User[];
  students: StudentRow[];
  initialGlobalFilterValue: string;
  initialSortingValue: SortingState;
}) => {
  const { authz_data, urlPrefix } = resLocals;
  console.log('build');
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
        <StudentsCard
          students={students ?? []}
          initialGlobalFilterValue={initialGlobalFilterValue}
          initialSortingValue={initialSortingValue}
        />
      )}
    </>
  );
};
