import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAuditEventSchema } from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { getGradebookRows } from '../../lib/gradebook.js';
import { getCourseInstanceUrl } from '../../lib/url.js';
import { selectAuditEventsByEnrollmentId } from '../../models/audit-event.js';
import {
  deleteEnrollment,
  inviteEnrollment,
  selectEnrollmentById,
  setEnrollmentStatus,
} from '../../models/enrollment.js';
import { selectUserById } from '../../models/user.js';

import { UserDetailSchema } from './components/OverviewCard.js';
import { InstructorStudentDetail } from './instructorStudentDetail.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/:enrollment_id(\\d+)',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    const { urlPrefix } = pageContext;
    const { course_instance: courseInstance, course, institution } = pageContext;
    const courseInstanceUrl = getCourseInstanceUrl(courseInstance.id);

    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {
      institution_id: institution.id,
      course_id: course.id,
      course_instance_id: courseInstance.id,
    });

    const student = await queryOptionalRow(
      sql.select_student_info,
      {
        enrollment_id: req.params.enrollment_id,
      },
      UserDetailSchema,
    );

    if (!student) {
      throw new HttpStatusError(404, 'Student not found');
    }

    // Trying to access a student from a different course instance.
    if (student.enrollment.course_instance_id !== courseInstance.id) {
      throw new HttpStatusError(404, 'Student not found');
    }

    const gradebookRows = student.user?.user_id
      ? await getGradebookRows({
          course_instance_id: courseInstance.id,
          user_id: student.user.user_id,
          authz_data: res.locals.authz_data,
          req_date: res.locals.req_date,
          auth: 'instructor',
        })
      : [];

    const pageTitle = run(() => {
      if (student.user) {
        return `${student.user.name} (${student.user.uid})`;
      }
      return `${student.enrollment.pending_uid}`;
    });

    const rawAuditEvents = await selectAuditEventsByEnrollmentId({
      enrollment_id: req.params.enrollment_id,
      table_names: ['enrollments'],
    });
    const auditEvents = rawAuditEvents.map((event) => StaffAuditEventSchema.parse(event));

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle,
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'students',
        },
        content: (
          <Hydrate>
            <InstructorStudentDetail
              auditEvents={auditEvents}
              gradebookRows={gradebookRows}
              student={student}
              urlPrefix={urlPrefix}
              courseInstanceUrl={courseInstanceUrl}
              csrfToken={pageContext.__csrf_token}
              hasCourseInstancePermissionEdit={
                pageContext.authz_data.has_course_instance_permission_edit
              }
              enrollmentManagementEnabled={enrollmentManagementEnabled}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/:enrollment_id(\\d+)',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const { authz_data: authzData, course_instance: courseInstance } = pageContext;

    const action = req.body.__action;
    const enrollment_id = req.params.enrollment_id;

    // assert that the enrollment belongs to the course instance
    const enrollment = await selectEnrollmentById({
      id: enrollment_id,
      courseInstance,
      requestedRole: 'Student Data Editor',
      authzData,
    });

    switch (action) {
      case 'block_student': {
        if (enrollment.status !== 'joined') {
          throw new HttpStatusError(400, 'Enrollment is not joined');
        }
        await setEnrollmentStatus({
          enrollment,
          status: 'blocked',
          authzData,
          requestedRole: 'Student Data Editor',
        });
        res.redirect(req.originalUrl);
        break;
      }
      case 'unblock_student': {
        if (enrollment.status !== 'blocked') {
          throw new HttpStatusError(400, 'Enrollment is not blocked');
        }
        await setEnrollmentStatus({
          enrollment,
          status: 'joined',
          authzData,
          requestedRole: 'Student Data Editor',
        });
        res.redirect(req.originalUrl);
        break;
      }
      case 'cancel_invitation': {
        if (enrollment.status !== 'invited') {
          throw new HttpStatusError(400, 'Enrollment is not invited');
        }
        await deleteEnrollment({
          enrollment,
          actionDetail: 'invitation_deleted',
          authzData,
          requestedRole: 'Student Data Editor',
        });
        res.redirect(`/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students`);
        break;
      }
      case 'invite_student': {
        if (!['rejected', 'removed'].includes(enrollment.status)) {
          throw new HttpStatusError(400, 'Enrollment is not rejected or removed');
        }

        const pendingUid = await run(async () => {
          if (enrollment.pending_uid) {
            return enrollment.pending_uid;
          }
          if (enrollment.user_id) {
            const user = await selectUserById(enrollment.user_id);
            return user.uid;
          }
          throw new HttpStatusError(400, 'Enrollment does not have a pending UID or user ID');
        });

        await inviteEnrollment({
          enrollment,
          pendingUid,
          authzData,
          requestedRole: 'Student Data Editor',
        });
        res.redirect(req.originalUrl);
        break;
      }
      default:
        throw new HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;
