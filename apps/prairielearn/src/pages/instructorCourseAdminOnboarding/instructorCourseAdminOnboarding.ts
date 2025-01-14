import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseHasCourseInstances } from '../../models/course-instances.js';

import { InstructorCourseAdminOnboarding } from './instructorCourseAdminOnboarding.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const course_id = res.locals.course?.id ?? null;

    const courseHasCourseStaff = false;
    const courseHasQuestion = false;
    const courseHasCourseInstance = course_id
      ? await selectCourseHasCourseInstances({ course_id })
      : false;
    const courseHasAssessment = false;

    res.send(
      InstructorCourseAdminOnboarding({
        resLocals: res.locals,
        courseHasCourseStaff,
        courseHasQuestion,
        courseHasCourseInstance,
        courseHasAssessment,
      }),
    );
  }),
);

export default router;
