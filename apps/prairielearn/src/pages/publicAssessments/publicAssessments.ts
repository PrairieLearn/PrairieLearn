import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
// import database queries from course-instances model
import { selectAssessments } from '../../models/course-instances.js';

import { selectCourseInstanceIsPublic } from '../../models/course-instance.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

import { AssessmentRowSchema, PublicAssessments } from './publicAssessments.html.js';

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const course_instance_id = req.params.course_instance_id;
    res.locals.course_instance = await selectCourseInstanceById(course_instance_id);
    res.locals.course = await selectCourseById(res.locals.course_instance.course_id);
    res.locals.urlPrefix = '/pl';

    const isPublic = await selectCourseInstanceIsPublic(course_instance_id);
    if (!isPublic) {
      throw new error.HttpStatusError(404, 'Course instance not public.');
    }

    const rows = await selectAssessments(
      {
        course_instance_id: res.locals.course_instance.id,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentRowSchema,
    );

    res.send(
      PublicAssessments({
        resLocals: res.locals,
        rows,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
      }),
    );
  }),
);

export default router;
