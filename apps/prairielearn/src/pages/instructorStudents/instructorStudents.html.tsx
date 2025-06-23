import { type SortingState } from '@tanstack/react-table';
import { NuqsAdapter } from 'nuqs/adapters/react';

import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import type { PageContext } from '../../lib/client/page-context.js';
import { type InstructorCourse, type InstructorCourseInstance } from '../../lib/db-types.js';

import { StudentsCard } from './components/StudentsCard.js';
import { type StudentRow } from './instructorStudents.shared.js';

export const InstructorStudents = ({
  pageContext,
  courseInstance,
  course,
  students,
  initialGlobalFilterValue,
  initialColumnSorts,
}: {
  pageContext: PageContext;
  courseInstance: InstructorCourseInstance;
  course: InstructorCourse;
  students: StudentRow[];
  initialGlobalFilterValue: string;
  initialColumnSorts: SortingState | undefined;
}) => {
  const { authz_data, urlPrefix } = pageContext;
  return (
    <NuqsAdapter>
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
        initialColumnSorts={initialColumnSorts}
      />
    </NuqsAdapter>
  );
};
