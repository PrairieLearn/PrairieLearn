import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { callRow, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { inviteStudentByUid, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';
import { selectOptionalUserByUid } from '../../models/user.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Supports a client-side table refresh.
router.get(
  '/data.json',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = pageContext;
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
    if (req.accepts('html')) {
      throw new HttpStatusError(406, 'Not Acceptable');
    }

    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = pageContext;
    const { uid } = req.query;
    if (typeof uid !== 'string') {
      throw new HttpStatusError(400, 'UID must be a string');
    }
    const enrollment = await selectOptionalEnrollmentByUid({
      courseInstance,
      uid,
      requiredRole: ['Student Data Viewer'],
      authzData: res.locals.authz_data,
    });
    const staffEnrollment = StaffEnrollmentSchema.nullable().parse(enrollment);
    res.json(staffEnrollment);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.accepts('html')) {
      throw new HttpStatusError(406, 'Not Acceptable');
    }

    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be an instructor)');
    }

    const { course_instance: courseInstance, course, authz_data: authzData } = pageContext;
    const {
      authn_user: { user_id: authnUserId },
      user: { user_id: userId },
    } = res.locals;

    const EmailsSchema = z.array(z.string().trim().email()).min(1, 'At least one UID is required');

    const BodySchema = z.object({
      uids: z.preprocess(
        (val) =>
          typeof val === 'string'
            ? [
                ...new Set(
                  val
                    .split(/[\n,\s]+/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
                ),
              ]
            : val,
        EmailsSchema,
      ),
      __action: z.literal('invite_uids'),
    });
    const body = BodySchema.parse(req.body);

    const serverJob = await createServerJob({
      courseId: course.id,
      courseInstanceId: courseInstance.id,
      type: 'invite_students',
      description: 'Invite students to course instance',
      userId,
      authnUserId,
    });

    serverJob.executeInBackground(async (job) => {
      const counts = {
        success: 0,
        instructor: 0,
        alreadyEnrolled: 0,
        alreadyBlocked: 0,
        alreadyInvited: 0,
      };

      for (const uid of body.uids) {
        const user = await selectOptionalUserByUid(uid);
        if (user) {
          // Check if user is an instructor
          const isInstructor = await callRow(
            'users_is_instructor_in_course_instance',
            [user.user_id, courseInstance.id],
            z.boolean(),
          );
          if (isInstructor) {
            job.info(`${uid}: Skipped (instructor)`);
            counts.instructor++;
            continue;
          }
        }

        const existingEnrollment = await selectOptionalEnrollmentByUid({
          courseInstance,
          uid,
          requiredRole: ['Student Data Viewer'],
          authzData,
        });

        if (existingEnrollment) {
          if (existingEnrollment.status === 'joined') {
            job.info(`${uid}: Skipped (already enrolled)`);
            counts.alreadyEnrolled++;
            continue;
          }
          if (existingEnrollment.status === 'invited') {
            job.info(`${uid}: Skipped (already invited)`);
            counts.alreadyInvited++;
            continue;
          }
          if (existingEnrollment.status === 'blocked') {
            job.info(`${uid}: Skipped (blocked)`);
            counts.alreadyBlocked++;
            continue;
          }
        }

        await inviteStudentByUid({
          courseInstance,
          uid,
          requiredRole: ['Student Data Editor'],
          authzData,
        });
        job.info(`${uid}: Invited`);
        counts.success++;
      }

      // Log summary at the end
      job.info('\nSummary:');
      job.info(`  Successfully invited: ${counts.success}`);
      if (counts.alreadyEnrolled > 0) {
        job.info(`  Already enrolled (skipped): ${counts.alreadyEnrolled}`);
      }
      if (counts.alreadyInvited > 0) {
        job.info(`  Already invited (skipped): ${counts.alreadyInvited}`);
      }
      if (counts.alreadyBlocked > 0) {
        job.info(`  Blocked (skipped): ${counts.alreadyBlocked}`);
      }
      if (counts.instructor > 0) {
        job.info(`  Instructors (skipped): ${counts.instructor}`);
      }
    });

    res.json({ job_sequence_id: serverJob.jobSequenceId });
  }),
);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    const {
      authz_data,
      __csrf_token: csrfToken,
      course_instance: courseInstance,
      course,
      institution,
    } = pageContext;

    const search = getUrl(req).search;

    if (!authz_data.has_course_instance_permission_view) {
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
        content: (
          <Hydrate fullHeight>
            <InstructorStudents
              enrollmentManagementEnabled={enrollmentManagementEnabled}
              isDevMode={config.devMode}
              authzData={authz_data}
              students={students}
              search={search}
              timezone={course.display_timezone}
              courseInstance={courseInstance}
              course={course}
              csrfToken={csrfToken}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
