import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { PageLayout } from '../../components/PageLayout.js';
import { selectTagsByCourseId } from '../../models/tags.js';

import { InstructorCourseAdminTags } from './instructorCourseAdminTags.html.js';

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
        content: InstructorCourseAdminTags({ resLocals: res.locals, tags }),
      }),
    );
  }),
);

export default router;
