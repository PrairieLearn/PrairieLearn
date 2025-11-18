import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { StaffTagSchema } from '../../lib/client/safe-db-types.js';
import { type Tag } from '../../lib/db-types.js';

import { InstructorCourseAdminTagsTable } from './components/InstructorCourseAdminTagsTable.js';

export function InstructorCourseAdminTags({
  resLocals,
  tags,
}: {
  resLocals: Record<string, any>;
  tags: Tag[];
}) {
  return (
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
  );
}
