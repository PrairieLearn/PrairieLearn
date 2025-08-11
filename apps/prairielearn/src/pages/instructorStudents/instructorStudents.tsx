import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { getCourseOwners } from '../../lib/course.js';
import { Hydrate } from '../../lib/preact.js';
import { getUrl } from '../../lib/url.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Supports a client-side table refresh.
router.get(
  '/data.json',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    const students = await queryRows(
      sql.select_students,
      { course_instance_id: courseInstance.id },
      StudentRowSchema,
    );
    res.json(students);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      res.status(403).json({ error: 'Access denied (must be an instructor)' });
      return;
    }

    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    try {
      const BodySchema = z.object({
        uid: z.string().min(1),
        __action: z.literal('invite_by_uid'),
      });
      const body = BodySchema.parse(req.body);

      await queryAsync(sql.insert_invite_by_uid, {
        course_instance_id: courseInstance.id,
        uid: body.uid,
      });

      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = getPageContext(res.locals);
    const { authz_data, urlPrefix, __csrf_token: csrfToken } = pageContext;
    const { course_instance: courseInstance, course } = getCourseInstanceContext(
      res.locals,
      'instructor',
    );

    const search = getUrl(req).search;

    if (!pageContext.authz_data.has_course_instance_permission_view) {
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
        headContent: compiledStylesheetTag('tanstackTable.css'),
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
                authzData={authz_data}
                students={students}
                search={search}
                timezone={course.display_timezone}
                courseInstance={courseInstance}
                course={course}
                csrfToken={csrfToken}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

export default router;
