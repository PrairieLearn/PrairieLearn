import { Router } from 'express';
import asyncHandler from 'express-async-handler';

// @ts-expect-error Not used in the current solution
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../../components/PageLayout.js';
import { AdminCourseSchema, AdminInstitutionSchema } from '../../../lib/client/safe-db-types.js';
import { insertCourse } from '../../../models/course.js';
import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz.js';

import { InstitutionAdminCourses } from './institutionAdminCourses.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = AdminInstitutionSchema.parse(
      await selectAndAuthzInstitutionAsAdmin({
        institution_id: req.params.institution_id,
        user_id: res.locals.authn_user.user_id,
        access_as_administrator: res.locals.access_as_administrator,
      }),
    );

    const courses = await queryRows(
      sql.select_courses,
      { institution_id: institution.id },
      AdminCourseSchema,
    );

    res.send(
      PageLayout({
        resLocals: {
          ...res.locals,
          institution,
        },
        pageTitle: `Courses — ${institution.short_name}`,
        navContext: {
          type: 'institution',
          page: 'institution_admin',
          subPage: 'courses',
        },
        content: (
          <Hydrate>
            <InstitutionAdminCourses courses={courses} csrfToken={res.locals.__csrf_token} />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    if (req.body.__action === 'add_course') {
      // throw new error.HttpStatusError(400, 'Server error');
      const course = await insertCourse({
        institution_id: institution.id,
        short_name: req.body.short_name,
        title: req.body.title,
        display_timezone: '',
        path: '',
        repository: '',
        branch: '',
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.json({ course_id: course.id });
    }
  }),
);
export default router;
