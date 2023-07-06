import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types';
import { InstitutionAdminCourse } from './institutionAdminCourse.html';
import { getInstitution } from '../../lib/institution';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const course = await queryRow(
      sql.select_course,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
      },
      CourseSchema,
    );
    const courseInstances = await queryRows(
      sql.select_course_instances,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
      },
      CourseInstanceSchema,
    );
    res.send(
      InstitutionAdminCourse({
        institution,
        course,
        course_instances: courseInstances,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
