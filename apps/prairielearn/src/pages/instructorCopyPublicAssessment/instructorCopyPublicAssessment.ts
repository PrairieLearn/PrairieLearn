import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { copyAssessmentBetweenCourseInstances } from '../../lib/copy-assessment.js';
import { CourseInstanceSchema, AssessmentSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';

import { selectCourseById } from '../../models/course.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // It doesn't make much sense to transfer a template course instance assessment to
    // the same template course instance, so we'll explicitly forbid that.

    if (idsEqual(req.body.course_instance_id, res.locals.course_instance.id)) {
      throw new error.HttpStatusError(
        400,
        'Template course instance assessments cannot be copied to the same course instance.',
      );
    }

    // This query will implicitly check that the assessment belongs to the given
    // course instance. We ensure below that the course instance is in fact in a template course.
    const result = await queryRow(
      sql.select_assessment,
      {
        // The ID of the assessment to copy.
        assessment_id: req.body.assessment_id,
        // The ID of the course instance to copy the assessment from.
        course_instance_id: req.body.course_instance_id,
      },
      z.object({
        assessment: AssessmentSchema,
        course_instance: CourseInstanceSchema,
      }),
    );

    const course = await selectCourseById(result.course_instance.course_id);

    if (!course.template_course && !result.assessment.share_source_publicly) {
      throw new error.HttpStatusError(400, 'Copying this assessment is not permitted');
    }

    await copyAssessmentBetweenCourseInstances(res, {
      fromCourse: course,
      fromCourseInstance: result.course_instance,
      toCourseInstanceId: res.locals.course_instance.id,
      assessment: result.assessment,
    });
  }),
);

export default router;
