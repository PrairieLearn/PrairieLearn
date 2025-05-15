import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessments } from '../../models/course-instances.js';
import { selectCourseInstanceIsPublic } from '../../models/course-instances.js';
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

    const isPublic = await selectCourseInstanceIsPublic(course_instance_id);
    if (!isPublic) {
      throw new error.HttpStatusError(404, 'Course instance not public.');
    }

    const rows = await selectAssessments(
      {
        course_instance_id: res.locals.course_instance.id,
      },
      AssessmentRowSchema,
    );

    res.send(
      PublicAssessments({
        resLocals: res.locals,
        rows,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
        courseInstanceId: course_instance_id,
      }),
    );
  }),
);

export default router;
