import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type Topic } from '../../lib/db-types.js';

import { InstructorCourseAdminTopicsTable } from './components/InstructorCourseAdminTopicsTable.js';

export function InstructorCourseAdminTopics({
  resLocals,
  topics,
  origHash,
}: {
  resLocals: Record<string, any>;
  topics: Topic[];
  origHash: string | null;
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
          authz_data={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />
        <InstructorCourseAdminTopicsTable
          topics={topics}
          hasCoursePermissionEdit={resLocals.authz_data.has_course_permission_edit}
          csrfToken={resLocals.__csrf_token}
          origHash={origHash}
        />
      </>
    ),
  });
}
