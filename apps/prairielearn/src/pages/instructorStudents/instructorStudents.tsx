import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getCourseOwners } from '../../lib/course.js';
import { Hydrate } from '../../lib/preact.js';
import { getUrl } from '../../lib/url.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    const { authz_data, urlPrefix } = pageContext;
    const { course_instance: courseInstance, course } = getCourseInstanceContext(
      res.locals,
      'instructor',
    );

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
      return;
    }

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
        content: (
          <>
            <CourseInstanceSyncErrorsAndWarnings
              authz_data={authz_data}
              courseInstance={courseInstance}
              course={course}
              urlPrefix={urlPrefix}
            />
            <Hydrate fullHeight>
              <InstructorStudents
                students={students}
                search={search}
                timezone={course.display_timezone}
                courseInstance={courseInstance}
                course={course}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

export default router;
