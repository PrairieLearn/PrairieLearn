import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import { DatetimeLocalStringSchema } from '@prairielearn/zod';

import { copyCourseInstanceBetweenCourses } from '../../lib/copy-content.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { start_date, end_date, course_instance_id } = z
      .object({
        start_date: DatetimeLocalStringSchema,
        end_date: DatetimeLocalStringSchema,
        course_instance_id: z.string(),
      })
      .parse(req.body);

    const courseInstance = await selectOptionalCourseInstanceById(course_instance_id);
    if (!courseInstance?.share_source_publicly) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    const course = await selectCourseById(courseInstance.course_id);

    const toCourseId = res.locals.course.id;

    const startDate = start_date.length > 0 ? start_date : undefined;
    const endDate = end_date.length > 0 ? end_date : undefined;

    const resolvedPublishing =
      (startDate ?? endDate)
        ? {
            startDate,
            endDate,
          }
        : undefined;

    const fileTransferId = await copyCourseInstanceBetweenCourses({
      fromCourse: course,
      fromCourseInstance: courseInstance,
      toCourseId,
      userId: res.locals.user.user_id,
      metadataOverrides: {
        publishing: resolvedPublishing,
      },
    });

    res.redirect(`/pl/course/${toCourseId}/file_transfer/${fileTransferId}`);
  }),
);

export default router;
