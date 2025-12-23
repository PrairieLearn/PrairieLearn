import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import { BooleanFromCheckboxSchema } from '@prairielearn/zod';

import { copyCourseInstanceBetweenCourses } from '../../lib/copy-content.js';
import { propertyValueWithDefault } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {
      institution_id: res.locals.institution.id,
      course_id: res.locals.course.id,
    });

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
        self_enrollment_enabled: BooleanFromCheckboxSchema,
        self_enrollment_use_enrollment_code: BooleanFromCheckboxSchema,
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

    const selfEnrollmentEnabled = propertyValueWithDefault(
      undefined,
      self_enrollment_enabled,
      true,
      { isUIBoolean: true },
    );
    const selfEnrollmentUseEnrollmentCode = propertyValueWithDefault(
      undefined,
      self_enrollment_use_enrollment_code,
      false,
    );

    const resolvedSelfEnrollment =
      (selfEnrollmentEnabled ?? selfEnrollmentUseEnrollmentCode) !== undefined &&
      enrollmentManagementEnabled
        ? {
            enabled: selfEnrollmentEnabled,
            useEnrollmentCode: selfEnrollmentUseEnrollmentCode,
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
