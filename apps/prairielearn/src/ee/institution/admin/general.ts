import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { InstitutionAdminGeneral } from './general.html';
import { getInstitution } from '../utils';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const InstitutionStatisticsSchema = z.object({
  course_count: z.number(),
  course_instance_count: z.number(),
  enrollment_count: z.number(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const institutionStatistics = await queryRow(
      sql.select_institution_statistics,
      { institution_id: req.params.institution_id },
      InstitutionStatisticsSchema
    );
    res.send(
      InstitutionAdminGeneral({
        institution,
        courseCount: institutionStatistics.course_count,
        courseInstanceCount: institutionStatistics.course_instance_count,
        enrollmentCount: institutionStatistics.enrollment_count,
        resLocals: res.locals,
      })
    );
  })
);

export default router;
