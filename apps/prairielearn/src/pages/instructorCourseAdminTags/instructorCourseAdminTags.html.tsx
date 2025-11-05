import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { StaffTagSchema } from '../../lib/client/safe-db-types.js';
import { type Tag } from '../../lib/db-types.js';

import { InstructorCourseAdminTagsTable } from './components/InstructorCourseAdminTagsTable.js';

export function InstructorCourseAdminTags({
  resLocals,
  tags,
  origHash,
}: {
  resLocals: Record<string, any>;
  tags: Tag[];
  origHash: string | null;
}) {
  const allowEdit =
    resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course;
  const StaffTags = z.array(StaffTagSchema).parse(tags);
  return PageLayout({
    resLocals,
    pageTitle: 'Tags',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'tags',
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
          <InstructorCourseAdminTagsTable
            tags={StaffTags}
            allowEdit={allowEdit}
            csrfToken={resLocals.__csrf_token}
            origHash={origHash}
          />
        </Hydrate>
      </>
    ),
  });
}
