import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAuditEventSchema, StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceBaseUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getGradebookRows } from '../../lib/gradebook.js';
import { selectAuditEventsByEnrollmentId } from '../../models/audit-event.js';
import {
  deleteEnrollment,
  inviteEnrollment,
  selectEnrollmentById,
  setEnrollmentStatus,
} from '../../models/enrollment.js';
import {
  selectStudentLabelsForEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
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
    const { urlPrefix, course_instance: courseInstance } = pageContext;
    const courseInstanceUrl = getCourseInstanceBaseUrl(courseInstance.id);

    const trpcUrl = `/pl/course_instance/${courseInstance.id}/instructor/trpc`;
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

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

    const gradebookRows = student.user?.id
      ? await getGradebookRows({
          courseInstance,
          userId: student.user.id,
          authzData: res.locals.authz_data,
          reqDate: res.locals.req_date,
          auth: 'instructor',
        })
      : [];
    const studentLabels = await selectStudentLabelsForEnrollment(student.enrollment);
    const availableStudentLabels = await selectStudentLabelsInCourseInstance(courseInstance);
    const rawAuditEvents = await selectAuditEventsByEnrollmentId({
      enrollment_id: req.params.enrollment_id,
      table_names: ['enrollments', 'student_label_enrollments'],
    });

    const pageTitle = run(() => {
      if (student.user) {
        return `${student.user.name} (${student.user.uid})`;
      }
      return `${student.enrollment.pending_uid}`;
    });

    const auditEvents = rawAuditEvents.map((event) => StaffAuditEventSchema.parse(event));

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle,
        navContext: {
          type: 'instructor',
          page: 'students',
          subPage: 'detail',
        },
        content: (
          <Hydrate>
            <InstructorStudentDetail
              auditEvents={auditEvents}
              gradebookRows={gradebookRows}
              student={student}
              studentLabels={z.array(StaffStudentLabelSchema).parse(studentLabels)}
              availableStudentLabels={z
                .array(StaffStudentLabelSchema)
                .parse(availableStudentLabels)}
              urlPrefix={urlPrefix}
              courseInstanceUrl={courseInstanceUrl}
              courseInstanceId={courseInstance.id}
              csrfToken={pageContext.__csrf_token}
              trpcCsrfToken={trpcCsrfToken}
              hasCoursePermissionEdit={pageContext.authz_data.has_course_permission_edit}
              hasCourseInstancePermissionEdit={
                pageContext.authz_data.has_course_instance_permission_edit ?? false
              }
              hasModernPublishing={courseInstance.modern_publishing}
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
      requiredRole: ['Student Data Editor'],
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
          requiredRole: ['Student Data Editor'],
        });
        res.redirect(req.originalUrl);
        break;
      }
      case 'cancel_invitation': {
        if (!['invited', 'rejected'].includes(enrollment.status)) {
          throw new HttpStatusError(400, 'Enrollment is not invited or rejected');
        }
        await deleteEnrollment({
          enrollment,
          actionDetail: 'invitation_deleted',
          authzData,
          requiredRole: ['Student Data Editor'],
        });
        res.redirect(`/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students`);
        break;
      }
      // TODO: `unblock_student` is retained for backward compatibility with clients.
      // We can safely remove this in a future release once this has been in
      // production for a while.
      case 'reenroll_student':
      case 'unblock_student': {
        if (enrollment.status !== 'removed' && enrollment.status !== 'blocked') {
          throw new HttpStatusError(400, 'Enrollment is not removed or blocked');
        }
        await setEnrollmentStatus({
          enrollment,
          status: 'joined',
          authzData,
          requiredRole: ['Student Data Editor'],
        });
        res.redirect(req.originalUrl);
        break;
      }
      case 'invite_student': {
        // We intentionally don't allow instructors to re-invite removed enrollments.
        // They can only transition them directly back to `joined`.
        if (!['rejected', 'left'].includes(enrollment.status)) {
          throw new HttpStatusError(400, 'Enrollment is not rejected or left');
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
          requiredRole: ['Student Data Editor'],
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
