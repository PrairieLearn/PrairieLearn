import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { getBaseContext, getCourseInstanceContext } from '../../lib/client/page-context.js';
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
    const baseContext = getBaseContext(res.locals);
    const { course_instance, course } = getCourseInstanceContext(res.locals, 'instructor');

    // TODO: Switch to nuqs for query params
    const { search, sortBy, sortOrder } = QuerySchema.parse(req.query);

    const hasPermission = baseContext.authz_data.has_course_instance_permission_view;
    if (!hasPermission) {
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: {
            ...baseContext,
            course_instance,
            course,
          },
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
        resLocals: {
          ...baseContext,
          course_instance,
          course,
        },
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
            baseContext={baseContext}
            courseInstance={course_instance}
            course={course}
            students={students}
            initialGlobalFilterValue={search}
            initialSortingValue={sortBy ? [{ id: sortBy, desc: sortOrder === 'desc' }] : []}
          />,
        ),
      }),
    );
  }),
);

export default router;
