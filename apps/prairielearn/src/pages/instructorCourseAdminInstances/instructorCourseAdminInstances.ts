import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceSchema, IdSchema } from '../../lib/db-types.js';
import { CourseInstanceAddEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import {
  InstructorCourseAdminInstances,
  type CourseInstanceAuthzRow,
} from './instructorCourseAdminInstances.html.js';

const router = express.Router();
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
      const editor = new CourseInstanceAddEditor({
        locals: res.locals,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      const courseInstanceId = await sqldb.queryRow(
        sql.select_course_instance_id_from_uuid,
        {
          uuid: editor.uuid,
          course_id: res.locals.course.id,
        },
        IdSchema,
      );

      res.redirect(
        res.locals.plainUrlPrefix +
          '/course_instance/' +
          courseInstanceId +
          '/instructor/instance_admin/settings',
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
