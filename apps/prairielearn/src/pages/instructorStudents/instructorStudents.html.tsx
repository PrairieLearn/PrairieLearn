import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { NuqsAdapter } from '../../lib/client/nuqs.js';
import type { PageContext } from '../../lib/client/page-context.js';
import { type InstructorCourse, type InstructorCourseInstance } from '../../lib/db-types.js';

import { StudentsCard } from './components/StudentsCard.js';
import { type StudentRow } from './instructorStudents.shared.js';

export const InstructorStudents = ({
  pageContext,
  courseInstance,
  course,
  students,
  search,
}: {
  pageContext: PageContext;
  courseInstance: InstructorCourseInstance;
  course: InstructorCourse;
  students: StudentRow[];
  search: string;
}) => {
  const { authz_data, urlPrefix } = pageContext;
  return (
    <NuqsAdapter search={search}>
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
      <StudentsCard students={students ?? []} />
    </NuqsAdapter>
  );
};
