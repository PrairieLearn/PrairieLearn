import { Temporal } from '@js-temporal/polyfill';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceSchema } from '../../lib/db-types.js';
import { CourseInstanceAddEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import {
  selectCourseInstanceByUuid,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';

import {
  type CourseInstanceAuthzRow,
  InstructorCourseAdminInstances,
} from './instructorCourseAdminInstances.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await fs.access(res.locals.course.path);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.locals.needToSync = true;
      } else {
        throw new Error('Invalid course path');
      }
    }

    const courseInstances: CourseInstanceAuthzRow[] = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const enrollmentCounts = await sqldb.queryRows(
      sql.select_enrollment_counts,
      { course_id: res.locals.course.id },
      z.object({ course_instance_id: CourseInstanceSchema.shape.id, enrollment_count: z.number() }),
    );

    courseInstances.forEach((ci) => {
      const row = enrollmentCounts.find((row) => idsEqual(row.course_instance_id, ci.id));
      ci.enrollment_count = row?.enrollment_count || 0;
    });

    res.send(InstructorCourseAdminInstances({ resLocals: res.locals, courseInstances }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_course_instance') {
      if (!req.body.short_name) {
        throw new error.HttpStatusError(400, 'short_name is required');
      }
      if (!req.body.long_name) {
        throw new error.HttpStatusError(400, 'long_name is required');
      }

      let startAccessDate: Temporal.ZonedDateTime | undefined;
      let endAccessDate: Temporal.ZonedDateTime | undefined;

      if (req.body.access_dates_enabled === 'on') {
        // Only parse the dates if access dates are enabled (the corresponding checkbox is checked)
        if (req.body.start_access_date) {
          startAccessDate = Temporal.PlainDateTime.from(req.body.start_access_date).toZonedDateTime(
            res.locals.course.display_timezone,
          );
        }
        if (req.body.end_access_date) {
          endAccessDate = Temporal.PlainDateTime.from(req.body.end_access_date).toZonedDateTime(
            res.locals.course.display_timezone,
          );
        }
      }

      if (
        startAccessDate &&
        endAccessDate &&
        startAccessDate.epochMilliseconds >= endAccessDate.epochMilliseconds
      ) {
        throw new error.HttpStatusError(400, 'end_access_date must be after start_access_date');
      }

      const editor = new CourseInstanceAddEditor({
        locals: res.locals as any,
        short_name: req.body.short_name,
        long_name: req.body.long_name,
        start_access_date: startAccessDate,
        end_access_date: endAccessDate,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      const courseInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course: res.locals.course,
      });

      flash('success', 'Course instance created successfully.');

      res.redirect(
        res.locals.plainUrlPrefix +
          '/course_instance/' +
          courseInstance.id +
          '/instructor/instance_admin/assessments',
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
