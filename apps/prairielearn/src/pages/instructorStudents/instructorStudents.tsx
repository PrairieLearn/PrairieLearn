import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getCourseOwners } from '../../lib/course.js';
import { hydrate } from '../../lib/preact.js';
import { getUrl } from '../../lib/url.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    const { course_instance, course } = getCourseInstanceContext(res.locals, 'instructor');

    const search = getUrl(req).search;

    const hasPermission = pageContext.authz_data.has_course_instance_permission_view;
    if (!hasPermission) {
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          courseOwners,
          pageTitle: 'Students',
          requiredPermissions: 'Instructor',
        }),
      );
    }

    const students = hasPermission
      ? (
          await queryRows(
            sql.select_students,
            {
              course_instance_id: course_instance.id,
            },
            StudentRowSchema,
          )
        ).map((student) => ({
          ...student.user,
          ...student.enrollment,
        }))
      : [];

    res.status(hasPermission ? 200 : 403).send(
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
        },
        content: hydrate(
          <InstructorStudents
            pageContext={pageContext}
            courseInstance={course_instance}
            course={course}
            students={students}
            search={search}
          />,
        ),
      }),
    );
  }),
);

export default router;
