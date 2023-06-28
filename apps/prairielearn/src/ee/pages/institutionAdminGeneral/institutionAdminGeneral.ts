import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import {
  InstitutionAdminGeneral,
  InstitutionStatisticsSchema,
} from './institutionAdminGeneral.html';
import { getInstitution } from '../../lib/institution';

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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_enrollment_limits') {
      await queryAsync(sql.update_enrollment_limits, {
        institution_id: req.params.institution_id,
        yearly_enrollment_limit: req.body.yearly_enrollment_limit || null,
        course_instance_enrollment_limit: req.body.course_instance_enrollment_limit || null,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  })
);

export default router;
