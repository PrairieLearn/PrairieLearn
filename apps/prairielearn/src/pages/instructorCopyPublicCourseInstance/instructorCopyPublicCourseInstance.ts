import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import { BooleanFromCheckboxSchema, DatetimeLocalStringSchema } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { copyCourseInstanceBetweenCourses } from '../../lib/copy-content.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Note that this context is for the course we are copying INTO (this route is just a POST handler).
    const { course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const {
      start_date,
      end_date,
      course_instance_id,
      self_enrollment_enabled,
      self_enrollment_use_enrollment_code,
    } = z
      .object({
        start_date: z.union([z.literal(''), DatetimeLocalStringSchema]),
        end_date: z.union([z.literal(''), DatetimeLocalStringSchema]),
        course_instance_id: z.string(),
        self_enrollment_enabled: BooleanFromCheckboxSchema,
        self_enrollment_use_enrollment_code: BooleanFromCheckboxSchema,
      })
      .parse(req.body);

    // The ID of the course instance we are copying
    const fromCourseInstance = await selectOptionalCourseInstanceById(course_instance_id);
    if (!fromCourseInstance?.share_source_publicly) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    const fromCourse = await selectCourseById(fromCourseInstance.course_id);

    // The ID of the course to copy the instance into
    const toCourseId = course.id;

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
    );
    const selfEnrollmentUseEnrollmentCode = propertyValueWithDefault(
      undefined,
      self_enrollment_use_enrollment_code,
      false,
    );

    const resolvedSelfEnrollment =
      (selfEnrollmentEnabled ?? selfEnrollmentUseEnrollmentCode) !== undefined
        ? {
            enabled: selfEnrollmentEnabled,
            useEnrollmentCode: selfEnrollmentUseEnrollmentCode,
          }
        : undefined;

    const fileTransferId = await copyCourseInstanceBetweenCourses({
      fromCourse,
      fromCourseInstance,
      toCourseId,
      userId: res.locals.user.id,
      metadataOverrides: {
        publishing: resolvedPublishing,
        selfEnrollment: resolvedSelfEnrollment,
      },
    });

    res.redirect(`/pl/course/${toCourseId}/file_transfer/${fileTransferId}`);
  }),
);

export default router;
