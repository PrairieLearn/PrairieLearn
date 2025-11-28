import { Temporal } from '@js-temporal/polyfill';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { CourseInstanceSchema } from '../../lib/db-types.js';
import { CourseInstanceAddEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import {
  selectCourseInstanceByUuid,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';

import { InstructorCourseAdminInstances } from './InstructorCourseAdminInstances.html.js';
import { InstructorCourseAdminInstanceRowSchema } from './instructorCourseAdminInstances.shared.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let needToSync = false;
    try {
      await fs.access(res.locals.course.path);
    } catch (err) {
      if (err.code === 'ENOENT') {
        needToSync = true;
      } else {
        throw new Error('Invalid course path', { cause: err });
      }
    }

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course: res.locals.course,
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

    const safeCourseInstancesWithEnrollmentCounts = z
      .array(InstructorCourseAdminInstanceRowSchema)
      .parse(
        courseInstances.map((ci) => ({
          ...ci,
          enrollment_count:
            enrollmentCounts.find((row) => idsEqual(row.course_instance_id, ci.id))
              ?.enrollment_count || 0,
        })),
      );

    // TODO: We need to land the refactor so I can add the course context as an option.
    const { course, __csrf_token, authz_data, urlPrefix } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course Instances',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'instances',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <>
            <CourseSyncErrorsAndWarnings
              authzData={res.locals.authz_data}
              course={course}
              urlPrefix={urlPrefix}
            />
            <Hydrate>
              <InstructorCourseAdminInstances
                courseInstances={safeCourseInstancesWithEnrollmentCounts}
                course={course}
                canEditCourse={authz_data.has_course_permission_edit}
                needToSync={needToSync}
                csrfToken={__csrf_token}
                urlPrefix={urlPrefix}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_course_instance') {
      const isJsonRequest = req.headers.accept?.includes('application/json');

      if (!req.body.short_name) {
        if (isJsonRequest) {
          res.status(400).json({ error: 'short_name is required' });
          return;
        }
        throw new error.HttpStatusError(400, 'short_name is required');
      }
      if (!req.body.long_name) {
        if (isJsonRequest) {
          res.status(400).json({ error: 'long_name is required' });
          return;
        }
        throw new error.HttpStatusError(400, 'long_name is required');
      }

      let startAccessDate: Temporal.ZonedDateTime | undefined;
      let endAccessDate: Temporal.ZonedDateTime | undefined;

      // Parse dates if provided (empty strings mean unpublished)
      if (req.body.start_date) {
        startAccessDate = Temporal.PlainDateTime.from(req.body.start_date).toZonedDateTime(
          res.locals.course.display_timezone,
        );
      }
      if (req.body.end_date) {
        endAccessDate = Temporal.PlainDateTime.from(req.body.end_date).toZonedDateTime(
          res.locals.course.display_timezone,
        );
      }

      if (
        startAccessDate &&
        endAccessDate &&
        startAccessDate.epochMilliseconds >= endAccessDate.epochMilliseconds
      ) {
        if (isJsonRequest) {
          res.status(400).json({ error: 'end_date must be after start_date' });
          return;
        }
        throw new error.HttpStatusError(400, 'end_date must be after start_date');
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
        if (isJsonRequest) {
          res.status(500).json({ job_sequence_id: serverJob.jobSequenceId });
          return;
        }
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      const courseInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course: res.locals.course,
      });

      if (isJsonRequest) {
        res.json({ course_instance_id: courseInstance.id });
        return;
      }

      flash('success', 'Course instance created successfully.');

      res.redirect(
        '/pl/course_instance/' + courseInstance.id + '/instructor/instance_admin/assessments',
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
