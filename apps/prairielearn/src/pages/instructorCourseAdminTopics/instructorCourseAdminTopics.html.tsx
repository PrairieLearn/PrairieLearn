import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type Topic } from '../../lib/db-types.js';
import { Hydrate } from '../../lib/preact.js';

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
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: CourseSyncErrorsAndWarnings({
              authz_data: resLocals.authz_data,
              course: resLocals.course,
              urlPrefix: resLocals.urlPrefix,
            }).toString(),
          }}
        />
        <Hydrate>
          <InstructorCourseAdminTopicsTable
            topics={topics}
            hasCoursePermissionEdit={resLocals.authz_data.has_course_permission_edit}
          />
        </Hydrate>
      </>
    ),
  });
}
