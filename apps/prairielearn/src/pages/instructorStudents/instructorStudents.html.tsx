import { type SortingState } from '@tanstack/react-table';

import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import type { BaseContext } from '../../lib/client/page-context.js';
import { type InstructorCourse, type InstructorCourseInstance } from '../../lib/db-types.js';

import { StudentsCard } from './components/StudentsCard.js';
import { type StudentRow } from './instructorStudents.types.js';

export const InstructorStudents = ({
  baseContext,
  courseInstance,
  course,
  students,
  initialGlobalFilterValue,
  initialSortingValue,
}: {
  baseContext: BaseContext;
  courseInstance: InstructorCourseInstance;
  course: InstructorCourse;
  students: StudentRow[];
  initialGlobalFilterValue: string;
  initialSortingValue: SortingState;
}) => {
  const { authz_data, urlPrefix } = baseContext;
  return (
    <>
      <div
        // TODO: After #12197 use the component directly
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{
          __html: CourseInstanceSyncErrorsAndWarnings({
            authz_data,
            courseInstance,
            course,
            urlPrefix,
          }).toString(),
        }}
      />
      <StudentsCard
        students={students ?? []}
        initialGlobalFilterValue={initialGlobalFilterValue}
        initialSortingValue={initialSortingValue}
      />
    </>
  );
};
