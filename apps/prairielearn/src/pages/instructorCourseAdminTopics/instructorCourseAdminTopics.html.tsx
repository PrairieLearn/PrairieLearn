import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { Hydrate } from '../../lib/preact.js';
import { InstructorCourseAdminTopicsTable } from './components/InstructorCourseAdminTopicsTable.js';
import { StaffTopicSchema } from '../../lib/client/safe-db-types.js';
import { type Topic } from '../../lib/db-types.js';
import { z } from 'zod';

export function InstructorCourseAdminTopics({
  resLocals,
  topics,
  origHash,
}: {
  resLocals: Record<string, any>;
  topics: Topic[];
  origHash: string | null;
}) {
  const allowEdit =
    resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course;
  const StaffTopics = z.array(StaffTopicSchema).parse(topics);
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
        <Hydrate>
          <InstructorCourseAdminTopicsTable
            topics={StaffTopics}
            allowEdit={allowEdit}
            csrfToken={resLocals.__csrf_token}
            origHash={origHash}
          />
        </Hydrate>
      </>
    ),
  });
}
