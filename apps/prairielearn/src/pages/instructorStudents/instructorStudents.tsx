import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.html.js';
import { getCourseOwners } from '../../lib/course.js';
import { hydrate } from '../../lib/preact.js';

import { InstructorStudents, type ResLocals } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      authz_data: {
        has_course_instance_permission_view,
        has_course_instance_permission_edit,
        has_course_permission_own,
      },
      course_instance,
      course,
      urlPrefix,
    } = res.locals;

    const resLocals: ResLocals = {
      authz_data: {
        has_course_instance_permission_view,
        has_course_instance_permission_edit,
        has_course_permission_own,
      },
      course_instance,
      course,
      urlPrefix,
    };

    const hasPermission = resLocals.authz_data.has_course_instance_permission_view;
    const courseOwners = hasPermission ? [] : await getCourseOwners(resLocals.course.id);
    const search = req.query.search as string;
    const sortBy = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder as string;

    const students = hasPermission
      ? await queryRows(
          sql.select_students,
          {
            course_instance_id: resLocals.course_instance.id,
          },
          StudentRowSchema,
        )
      : [];

    res.status(hasPermission ? 200 : 403).send(
      PageLayout({
        resLocals,
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
            resLocals={resLocals}
            students={students}
            courseOwners={courseOwners}
            initialGlobalFilterValue={search ?? ''}
            initialSortingValue={sortBy ? [{ id: sortBy, desc: sortOrder === 'desc' }] : []}
          />,
        ),
      }),
    );
  }),
);

export default router;
