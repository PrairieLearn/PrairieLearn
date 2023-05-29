import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { InstitutionAdminGeneral, InstitutionStatisticsSchema } from './general.html';
import { getInstitution } from '../utils';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const statistics = await queryRow(
      sql.select_institution_statistics,
      { institution_id: req.params.institution_id },
      InstitutionStatisticsSchema
    );
    res.send(
      InstitutionAdminGeneral({
        institution,
        statistics,
        resLocals: res.locals,
      })
    );
  })
);

export default router;
