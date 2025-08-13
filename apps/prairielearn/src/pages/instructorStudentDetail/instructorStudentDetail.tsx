import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getGradebookRows } from '../../lib/gradebook.js';
import { Hydrate } from '../../lib/preact.js';
import { getCourseInstanceUrl } from '../../lib/url.js';
import { selectAuditEvents } from '../../models/audit-event.js';

import { UserDetailSchema } from './components/OverviewCard.js';
import { InstructorStudentDetail } from './instructorStudentDetail.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/:user_id(\\d+)',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const pageContext = getPageContext(res.locals);
    const { urlPrefix, authz_data } = pageContext;
    const { course_instance } = getCourseInstanceContext(res.locals, 'instructor');
    const courseInstanceUrl = getCourseInstanceUrl(course_instance.id);

    const student = await queryOptionalRow(
      sql.select_student_info,
      {
        user_id: req.params.user_id,
        course_instance_id: course_instance.id,
      },
      UserDetailSchema,
    );

    if (!student) {
      throw new HttpStatusError(404, 'Student not found');
    }

    const gradebookRows = await getGradebookRows({
      course_instance_id: course_instance.id,
      user_id: req.params.user_id,
      authz_data,
      req_date: res.locals.req_date,
      auth: 'instructor',
    });

    const auditEvents = await selectAuditEvents({
      subject_user_id: req.params.user_id,
      course_instance_id: course_instance.id,
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: `${student.user.name} (${student.user.uid})`,
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'gradebook',
        },
        content: (
          <Hydrate>
            <InstructorStudentDetail
              auditEvents={auditEvents}
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
