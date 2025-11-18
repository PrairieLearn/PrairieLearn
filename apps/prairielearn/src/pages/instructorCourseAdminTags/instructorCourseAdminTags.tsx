import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { StaffTagSchema } from '../../lib/client/safe-db-types.js';
import { selectTagsByCourseId } from '../../models/tags.js';

import { InstructorCourseAdminTagsTable } from './components/InstructorCourseAdminTagsTable.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await selectTagsByCourseId(res.locals.course.id);

    res.send(
      PageLayout({
        resLocals: res.locals,
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
              authzData={res.locals.authz_data}
              course={res.locals.course}
              urlPrefix={res.locals.urlPrefix}
            />
            <Hydrate>
              <InstructorCourseAdminTagsTable tags={z.array(StaffTagSchema).parse(tags)} />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

export default router;
