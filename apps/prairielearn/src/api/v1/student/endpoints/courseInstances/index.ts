import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { constructCourseOrInstanceContext } from '../../../../../lib/authz-data.js';
import { CourseInstanceSchema, CourseSchema } from '../../../../../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const StudentCourseInstanceSchema = z.object({
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  course_instance_long_name: CourseInstanceSchema.shape.long_name,
  course_instance_course_id: CourseInstanceSchema.shape.course_id,
  display_timezone: CourseInstanceSchema.shape.display_timezone,
  course_short_name: CourseSchema.shape.short_name,
  course_title: CourseSchema.shape.title,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const joinedCourseInstances = await sqldb.queryRows(
      sql.select_joined_course_instances,
      { user_id: res.locals.authn_user.id },
      StudentCourseInstanceSchema,
    );

    // Being enrolled isn't sufficient: the course instance must also be
    // accessible to the student right now. We use the same enrollment and
    // access check as the per-course-instance routes. Those routes may still
    // deny access for other reasons (for example, missing plan grants).
    const courseInstances = [];
    for (const courseInstance of joinedCourseInstances) {
      const { authzData } = await constructCourseOrInstanceContext({
        user: res.locals.authn_user,
        course_id: null,
        course_instance_id: courseInstance.course_instance_id,
        ip: req.ip || null,
        req_date: res.locals.req_date,
        // Administrator access doesn't count as student access.
        is_administrator: false,
        // The `forbidAccessInExamMode` middleware has already run.
        overrides: { mode: 'Public' },
      });
      if (authzData?.has_student_access_with_enrollment) {
        courseInstances.push(courseInstance);
      }
    }

    res.status(200).send(z.array(StudentCourseInstanceSchema).parse(courseInstances));
  }),
);

export default router;
