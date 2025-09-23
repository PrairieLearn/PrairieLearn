import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { getCourseOwners } from '../../lib/course.js';
import { EnrollmentSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Supports a client-side table refresh.
router.get(
  '/data.json',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    const students = await queryRows(
      sql.select_students,
      { course_instance_id: courseInstance.id },
      StudentRowSchema,
    );
    res.json(students);
  }),
);

router.get(
  '/enrollment.json',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    const { uid } = req.query;
    const staffEnrollment = await queryOptionalRow(
      sql.select_enrollment_by_uid,
      { course_instance_id: courseInstance.id, uid },
      StaffEnrollmentSchema,
    );
    res.json(staffEnrollment);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      res.status(403).json({ error: 'Access denied (must be an instructor)' });
      return;
    }

    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    try {
      const BodySchema = z.object({
        uid: z.string().min(1),
        __action: z.literal('invite_by_uid'),
      });
      const body = BodySchema.parse(req.body);

      const existingEnrollment = await queryOptionalRow(
        sql.select_enrollment_by_uid,
        {
          course_instance_id: courseInstance.id,
          uid: body.uid,
        },
        EnrollmentSchema,
      );

      if (!existingEnrollment) {
        const enrollment = await queryRow(
          sql.upsert_enrollment_by_uid,
          {
            course_instance_id: courseInstance.id,
            uid: body.uid,
          },
          StaffEnrollmentSchema,
        );
        res.json({ ok: true, data: enrollment });
        return;
      }

      // Case 1: if the user is already enrolled, we can't invite them without that user being de-enrolled first.
      const isEnrolled = existingEnrollment.status === 'joined';
      if (isEnrolled) {
        res.status(400).json({ error: 'The user is already enrolled' });
        return;
      }

      // Case 2: the user has a existing invitation, we can't invite them again.
      const hasExistingInvitation = existingEnrollment.status === 'invited';

      if (hasExistingInvitation) {
        res.status(400).json({ error: 'The user has a existing invitation' });
        return;
      }

      // If the user is synced via LTI, they are either invited via LTI or removed via LTI. The UI has
      // already confirmed that the instructor means to de-sync them from LTI and invite them again.
      // If they are not synced via LTI, we can invite them. So in both cases, we can invite them.
      const enrollment = await queryRow(
        sql.upsert_enrollment_by_uid,
        {
          course_instance_id: courseInstance.id,
          uid: body.uid,
        },
        StaffEnrollmentSchema,
      );

      res.json({ ok: true, data: enrollment });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }),
);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    const { authz_data, urlPrefix, __csrf_token: csrfToken } = pageContext;
    const {
      course_instance: courseInstance,
      course,
      institution,
    } = getCourseInstanceContext(res.locals, 'instructor');

    const search = getUrl(req).search;

    if (!pageContext.authz_data.has_course_instance_permission_view) {
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'instance_admin',
            subPage: 'students',
          },
          courseOwners,
          pageTitle: 'Students',
          requiredPermissions: 'Student Data Viewer',
        }),
      );
      return;
    }

    // For now, this is a development-only feature, so that can can get PRs merged without affecting users.
    const enrollmentManagementEnabled =
      (await features.enabled('enrollment-management', {
        institution_id: institution.id,
        course_id: course.id,
        course_instance_id: courseInstance.id,
      })) && authz_data.is_administrator;

    const students = await queryRows(
      sql.select_students,
      { course_instance_id: courseInstance.id },
      StudentRowSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Students',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'students',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        headContent: compiledStylesheetTag('tanstackTable.css'),
        content: (
          <>
            <CourseInstanceSyncErrorsAndWarnings
              authzData={{
                has_course_instance_permission_edit:
                  authz_data.has_course_instance_permission_edit ?? false,
              }}
              courseInstance={courseInstance}
              course={course}
              urlPrefix={urlPrefix}
            />
            <Hydrate fullHeight>
              <InstructorStudents
                enrollmentManagementEnabled={enrollmentManagementEnabled}
                isDevMode={process.env.NODE_ENV === 'development'}
                authzData={authz_data}
                students={students}
                search={search}
                timezone={course.display_timezone}
                courseInstance={courseInstance}
                course={course}
                csrfToken={csrfToken}
                urlPrefix={urlPrefix}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

export default router;
