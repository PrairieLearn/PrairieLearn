import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { CourseSchema } from '../../../lib/db-types.js';
import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz.js';

import { InstitutionAdminCourses } from './institutionAdminCourses.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    const courses = await queryRows(
      sql.select_courses,
      { institution_id: institution.id },
      CourseSchema,
    );

    res.send(InstitutionAdminCourses({ institution, courses, resLocals: res.locals }));
  }),
);

export default router;
