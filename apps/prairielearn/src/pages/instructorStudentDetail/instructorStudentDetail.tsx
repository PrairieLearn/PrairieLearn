import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getGradebookRows } from '../../lib/gradebook.js';
import { getCourseInstanceUrl } from '../../lib/url.js';

import { InstructorStudentDetail, UserDetailSchema } from './instructorStudentDetail.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/:user_id(\\d+)',
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
        user_id: req.params.user_id,
        course_instance_id: res.locals.course_instance.id,
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
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
