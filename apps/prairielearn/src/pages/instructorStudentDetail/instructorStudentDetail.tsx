import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getGradebookRows } from '../../lib/gradebook.js';
import { Hydrate } from '../../lib/preact.js';
import { getCourseInstanceUrl } from '../../lib/url.js';

import { InstructorStudentDetail, UserDetailSchema } from './instructorStudentDetail.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/:enrollment_id(\\d+)',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const pageContext = getPageContext(res.locals);
    const { urlPrefix } = pageContext;
    const courseInstanceContext = getCourseInstanceContext(res.locals, 'instructor');
    const courseInstanceUrl = getCourseInstanceUrl(courseInstanceContext.course_instance.id);

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

    const gradebookRows = await getGradebookRows({
      course_instance_id: res.locals.course_instance.id,
      user_id: req.params.user_id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      auth: 'instructor',
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: `${student.user.name} (${student.user.uid})`,
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'students',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <InstructorStudentDetail
              gradebookRows={gradebookRows}
              student={student}
              urlPrefix={urlPrefix}
              courseInstanceUrl={courseInstanceUrl}
              csrfToken={pageContext.__csrf_token}
              hasCourseInstancePermissionEdit={
                pageContext.authz_data.has_course_instance_permission_edit
              }
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/:user_id(\\d+)',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const action = req.body.__action;
    const course_instance_id = res.locals.course_instance.id;
    const user_id = req.params.user_id;

    switch (action) {
      case 'block_student': {
        await execute(sql.update_enrollment_block, { course_instance_id, user_id });
        break;
      }
      case 'unblock_student': {
        await execute(sql.update_enrollment_unblock, { course_instance_id, user_id });
        break;
      }
      case 'cancel_invitation': {
        await execute(sql.delete_invitation_by_user_id, { course_instance_id, user_id });
        break;
      }
      default:
        throw new HttpStatusError(400, 'Unknown action');
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
