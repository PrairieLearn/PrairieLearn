import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { inviteStudentByUid, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';

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
      sql.select_users_and_enrollments_for_course_instance,
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
    if (typeof uid !== 'string') {
      throw new HttpStatusError(400, 'UID must be a string');
    }
    const enrollment = await selectOptionalEnrollmentByUid({
      courseInstance,
      uid,
      requestedRole: 'Student Data Viewer',
      authzData: res.locals.authz_data,
    });
    const staffEnrollment = StaffEnrollmentSchema.nullable().parse(enrollment);
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

      // Try to find an existing enrollment so we can error gracefully.
      const existingEnrollment = await selectOptionalEnrollmentByUid({
        courseInstance,
        uid: body.uid,
        requestedRole: 'Student Data Viewer',
        authzData: res.locals.authz_data,
      });

      if (existingEnrollment) {
        if (existingEnrollment.status === 'joined') {
          res.status(400).json({ error: 'The user is already enrolled' });
          return;
        }

        if (existingEnrollment.status === 'invited') {
          res.status(400).json({ error: 'The user has an existing invitation' });
          return;
        }
      }

      const enrollment = await inviteStudentByUid({
        courseInstance,
        uid: body.uid,
        requestedRole: 'Student Data Editor',
        authzData: res.locals.authz_data,
      });

      const staffEnrollment = StaffEnrollmentSchema.parse(enrollment);

      res.json({ ok: true, data: staffEnrollment });
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
      sql.select_users_and_enrollments_for_course_instance,
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
