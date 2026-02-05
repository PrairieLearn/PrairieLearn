import { Temporal } from '@js-temporal/polyfill';
import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { CourseInstanceSchema, EnumCourseInstanceRoleSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { CourseInstanceAddEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { validateShortName } from '../../lib/short-name.js';
import {
  selectCourseInstanceByUuid,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';
import { insertCourseInstancePermissions } from '../../models/course-permissions.js';

import { InstructorCourseAdminInstances } from './InstructorCourseAdminInstances.html.js';
import { InstructorCourseAdminInstanceRowSchema } from './instructorCourseAdminInstances.shared.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    let needToSync = false;
    try {
      await fs.access(res.locals.course.path);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        needToSync = true;
      } else {
        throw new Error('Invalid course path', { cause: err });
      }
    }

    const {
      authz_data: authzData,
      course,
      __csrf_token,
      urlPrefix,
      is_administrator: isAdministrator,
    } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Previewer', 'Student Data Viewer'],
    });

    const enrollmentCounts = await sqldb.queryRows(
      sql.select_enrollment_counts,
      { course_id: course.id },
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
          <Hydrate>
            <InstructorCourseAdminInstances
              courseInstances={safeCourseInstancesWithEnrollmentCounts}
              course={course}
              canEditCourse={authzData.has_course_permission_edit}
              needToSync={needToSync}
              csrfToken={__csrf_token}
              urlPrefix={urlPrefix}
              isAdministrator={isAdministrator}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { course, authz_data: authzData } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (req.body.__action === 'add_course_instance') {
      const {
        short_name,
        long_name,
        start_date,
        end_date,
        self_enrollment_enabled,
        self_enrollment_use_enrollment_code,
        course_instance_permission,
      } = z
        .object({
          short_name: z.string().trim(),
          long_name: z.string().trim(),
          start_date: z.string(),
          end_date: z.string(),
          self_enrollment_enabled: z.boolean().optional(),
          self_enrollment_use_enrollment_code: z.boolean().optional(),
          course_instance_permission: EnumCourseInstanceRoleSchema.optional().default('None'),
        })
        .parse(req.body);

      if (!short_name) {
        throw new error.HttpStatusError(400, 'Short name is required');
      }

      if (!long_name) {
        throw new error.HttpStatusError(400, 'Long name is required');
      }

      const shortNameValidation = validateShortName(short_name);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(
          400,
          `Invalid short name: ${shortNameValidation.lowercaseMessage}`,
        );
      }

      const existingNames = await sqldb.queryRows(
        sql.select_names,
        { course_id: course.id },
        z.object({ short_name: z.string(), long_name: z.string().nullable() }),
      );
      const existingShortNames = existingNames.map((name) => name.short_name.toLowerCase());
      const existingLongNames = existingNames
        .map((name) => name.long_name?.toLowerCase())
        .filter((name) => name != null);

      if (existingShortNames.includes(short_name.toLowerCase())) {
        throw new error.HttpStatusError(
          400,
          'A course instance with this short name already exists',
        );
      }

      if (existingLongNames.includes(long_name.toLowerCase())) {
        throw new error.HttpStatusError(
          400,
          'A course instance with this long name already exists',
        );
      }

      // Parse dates if provided (empty strings mean unpublished)
      const startDate = start_date.length > 0 ? start_date : undefined;
      const endDate = end_date.length > 0 ? end_date : undefined;

      if (startDate && endDate) {
        const startAccessDate = Temporal.PlainDateTime.from(startDate).toZonedDateTime(
          course.display_timezone,
        );
        const endAccessDate = Temporal.PlainDateTime.from(endDate).toZonedDateTime(
          course.display_timezone,
        );
        if (startAccessDate.epochMilliseconds >= endAccessDate.epochMilliseconds) {
          throw new error.HttpStatusError(400, 'End date must be after start date');
        }
      }

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

      const editor = new CourseInstanceAddEditor({
        locals: res.locals,
        short_name,
        long_name,
        metadataOverrides: {
          publishing: resolvedPublishing,
          selfEnrollment: resolvedSelfEnrollment,
        },
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.status(400).json({ job_sequence_id: serverJob.jobSequenceId });
        return;
      }

      const courseInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course,
      });

      // Assign course instance permissions if a non-None permission was selected.
      if (course_instance_permission !== 'None') {
        await insertCourseInstancePermissions({
          course_id: course.id,
          course_instance_id: courseInstance.id,
          user_id: authzData.authn_user.id,
          course_instance_role: course_instance_permission,
          authn_user_id: authzData.authn_user.id,
        });
      }

      res.json({ course_instance_id: courseInstance.id });
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
