import asyncHandler = require('express-async-handler');
import express = require('express');
import sqldb = require('@prairielearn/postgres');

import { AdministratorInstitutions, InstitutionRowSchema } from './administratorInstitutions.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionRowSchema);
    res.send(AdministratorInstitutions({ institutions, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'add_institution') {
      const institutionId = await sqldb.queryAsync(sql.add_institution, {
        short_name: req.body.short_name,
        long_name: req.body.long_name,
        display_timezone: req.body.display_timezone,
        course_instance_enrollment_limit: req.body.course_instance_enrollment_limit,
        yearly_enrollment_limit: req.body.yearly_enrollment_limit,
        uid_regexp: req.body.uid_regexp,
      });
      req.body.authn_providers.split(', ').forEach(async (provider) => {
        await sqldb.queryAsync(sql.add_institution_authn_provider, {
          institution_id: institutionId.rows[0].id,
          authn_provider_name: provider,
        });
      });
    }

    res.redirect('./institutions');
  }),
);

export default router;
