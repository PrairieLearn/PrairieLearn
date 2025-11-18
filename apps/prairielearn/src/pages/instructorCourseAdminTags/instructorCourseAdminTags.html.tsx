import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { StaffTagSchema } from '../../lib/client/safe-db-types.js';
import { type Tag } from '../../lib/db-types.js';
import type { UntypedResLocals } from '../../lib/res-locals.js';

import { InstructorCourseAdminTagsTable } from './components/InstructorCourseAdminTagsTable.js';

export function InstructorCourseAdminTags({
  resLocals,
  tags,
}: {
  resLocals: UntypedResLocals;
  tags: Tag[];
}) {
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
          <InstructorCourseAdminTagsTable tags={z.array(StaffTagSchema).parse(tags)} />
        </Hydrate>
      </>
    ),
  });
}
