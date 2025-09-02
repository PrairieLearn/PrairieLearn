import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { type Topic } from '../../lib/db-types.js';

import { InstructorCourseAdminTopicsTable } from './components/InstructorCourseAdminTopicsTable.js';

export function InstructorCourseAdminTopics({
  resLocals,
  topics,
}: {
  resLocals: Record<string, any>;
  topics: Topic[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Topics',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'topics',
    },
    options: {
      fullWidth: true,
    },
    content: (
      <>
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />
        <InstructorCourseAdminTopicsTable topics={topics} />
      </>
    ),
  });
}
