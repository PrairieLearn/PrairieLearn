import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { getCourseInstanceCopyTargets } from '../../lib/copy-content.js';
import { selectAssessments } from '../../models/assessment.js';
import { selectCourseInstanceIsPublic } from '../../models/course-instances.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

import { PublicAssessments } from './publicAssessments.html.js';

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseInstance = await selectOptionalCourseInstanceById(req.params.course_instance_id);
    if (courseInstance === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    res.locals.course_instance = courseInstance;
    res.locals.course = await selectCourseById(courseInstance.course_id);

    const isPublic = await selectCourseInstanceIsPublic(courseInstance.id);
    if (!isPublic) {
      throw new error.HttpStatusError(404, 'Course instance not public.');
    }

    res.locals.user = res.locals.authn_user; // Need user to get copy targets. On public URLs, authn_user and user are always equal
    const courseInstanceCopyTargets = await getCourseInstanceCopyTargets(res);

    const rows = await selectAssessments({
      course_instance_id: courseInstance.id,
    });

    res.send(
      PublicAssessments({
        resLocals: res.locals,
        rows,
        courseInstance,
        courseInstanceCopyTargets,
      }),
    );
  }),
);

export default router;
