import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectTagsByCourseId } from '../../models/tags.js';

import { InstructorCourseAdminTags } from './instructorCourseAdminTags.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await selectTagsByCourseId(res.locals.course.id);

    res.send(InstructorCourseAdminTags({ resLocals: res.locals, tags }));
  }),
);

export default router;
