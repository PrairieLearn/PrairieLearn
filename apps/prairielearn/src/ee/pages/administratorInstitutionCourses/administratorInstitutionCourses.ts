import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { CourseSchema } from '../../../lib/db-types.js';
import { getInstitution } from '../../lib/institution.js';

import { AdministratorInstitutionCourses } from './administratorInstitutionCourses.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const courses = await queryRows(
      sql.select_courses,
      { institution_id: req.params.institution_id },
      CourseSchema,
    );
    res.send(AdministratorInstitutionCourses({ institution, courses, resLocals: res.locals }));
  }),
);

export default router;
