import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../../components/PageLayout.js';
import { AdminCourseSchema, AdminInstitutionSchema } from '../../../lib/client/safe-db-types.js';
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
        user_id: res.locals.authn_user.id,
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
        content: <InstitutionAdminCourses courses={courses} />,
      }),
    );
  }),
);

export default router;
