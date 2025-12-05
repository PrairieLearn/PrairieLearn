import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';

import { copyCourseInstanceBetweenCourses } from '../../lib/copy-content.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      start_date,
      end_date,
      course_instance_id,
      self_enrollment_enabled,
      self_enrollment_use_enrollment_code,
    } = z
      .object({
        // This works around a bug in Chrome where seconds are omitted from the input value when they're 0.
        // We would normally solve this on the client side, but this page does a HTML POST, so transformations
        // done via react-hook-form don't work.

        // https://stackoverflow.com/questions/19504018/show-seconds-on-input-type-date-local-in-chrome
        // https://issues.chromium.org/issues/41159420

        start_date: z.string().transform((v) => (v.length === 16 ? `${v}:00` : v)),
        end_date: z.string().transform((v) => (v.length === 16 ? `${v}:00` : v)),
        course_instance_id: z.string(),
        // HTML form checkboxes send "on" when checked and are absent (undefined) when unchecked
        self_enrollment_enabled: z.preprocess((val) => val === 'on', z.boolean()).optional(),
        self_enrollment_use_enrollment_code: z
          .preprocess((val) => val === 'on', z.boolean())
          .optional(),
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

    const resolvedSelfEnrollment =
      self_enrollment_enabled !== undefined
        ? {
            enabled: self_enrollment_enabled,
            useEnrollmentCode: self_enrollment_use_enrollment_code,
          }
        : undefined;

    const fileTransferId = await copyCourseInstanceBetweenCourses({
      fromCourse: course,
      fromCourseInstance: courseInstance,
      toCourseId,
      userId: res.locals.user.user_id,
      metadataOverrides: {
        publishing: resolvedPublishing,
        selfEnrollment: resolvedSelfEnrollment,
      },
    });

    res.redirect(`/pl/course/${toCourseId}/file_transfer/${fileTransferId}`);
  }),
);

export default router;
