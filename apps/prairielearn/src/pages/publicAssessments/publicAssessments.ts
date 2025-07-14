import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { getCourseInstanceCopyTargets } from '../../lib/copy-content.js';
import { UserSchema } from '../../lib/db-types.js';
import { selectAssessments } from '../../models/assessment.js';
import {
  selectCourseInstanceIsPublic,
  selectOptionalCourseInstanceById,
} from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionsForCourseInstanceCopy } from '../../models/question.js';

import { PublicAssessments } from './publicAssessments.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseInstance = await selectOptionalCourseInstanceById(req.params.course_instance_id);
    if (courseInstance === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    res.locals.course_instance = courseInstance;
    const course = await selectCourseById(courseInstance.course_id);
    res.locals.course = course;

    const isPublic = await selectCourseInstanceIsPublic(courseInstance.id);
    if (!isPublic) {
      throw new error.HttpStatusError(404, 'Course instance not public.');
    }

    const courseInstanceCopyTargets = await getCourseInstanceCopyTargets({
      course,
      is_administrator: res.locals.is_administrator,
      user: UserSchema.parse(res.locals.authn_user),
      authn_user: res.locals.authn_user,
      courseInstance,
    });

    const rows = await selectAssessments({
      course_instance_id: courseInstance.id,
    });
    const questionsForCopy = await selectQuestionsForCourseInstanceCopy(courseInstance.id);

    res.send(
      PublicAssessments({
        resLocals: res.locals,
        rows,
        course,
        courseInstance,
        courseInstanceCopyTargets,
        questionsForCopy,
      }),
    );
  }),
);

export default router;
