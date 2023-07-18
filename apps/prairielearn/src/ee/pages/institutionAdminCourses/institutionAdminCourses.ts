import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { getInstitution } from '../../lib/institution';
import { InstitutionAdminCourses } from './institutionAdminCourses.html';
import { CourseSchema } from '../../../lib/db-types';

const sql = loadSqlEquiv(__filename);
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
    res.send(InstitutionAdminCourses({ institution, courses, resLocals: res.locals }));
  }),
);

export default router;
