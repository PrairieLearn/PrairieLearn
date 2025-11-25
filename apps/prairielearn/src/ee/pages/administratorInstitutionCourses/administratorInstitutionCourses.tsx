import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../../components/PageLayout.js';
import { AdminCourseSchema, AdminInstitutionSchema } from '../../../lib/client/safe-db-types.js';
import { getInstitution } from '../../lib/institution.js';

import { AdministratorInstitutionCourses } from './administratorInstitutionCourses.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = AdminInstitutionSchema.parse(
      await getInstitution(req.params.institution_id),
    );
    const courses = await queryRows(
      sql.select_courses,
      { institution_id: req.params.institution_id },
      AdminCourseSchema,
    );
    res.send(
      PageLayout({
        resLocals: { ...res.locals, institution },
        pageTitle: 'Courses - Institution Admin',
        navContext: {
          type: 'administrator_institution',
          page: 'administrator_institution',
          subPage: 'courses',
        },
        content: <AdministratorInstitutionCourses institution={institution} courses={courses} />,
      }),
    );
  }),
);

export default router;
