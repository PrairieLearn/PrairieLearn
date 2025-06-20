import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.html.js';
import { stripResLocals } from '../../lib/client/res-locals.js';
import { getCourseOwners } from '../../lib/course.js';
import { hydrate } from '../../lib/preact.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const QuerySchema = z.object({
  search: z.string().optional().default(''),
  sortBy: z.string().optional().default(''),
  sortOrder: z.enum(['asc', 'desc']).optional().nullable().default(null),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const resLocals = stripResLocals(res.locals);
    console.log('resLocals', resLocals);

    const hasPermission = resLocals.authz_data.has_course_instance_permission_view;
    const courseOwners = hasPermission ? [] : await getCourseOwners(resLocals.course.id);

    const { search, sortBy, sortOrder } = QuerySchema.parse(req.query);

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
            initialGlobalFilterValue={search}
            initialSortingValue={sortBy ? [{ id: sortBy, desc: sortOrder === 'desc' }] : []}
          />,
        ),
      }),
    );
  }),
);

export default router;
