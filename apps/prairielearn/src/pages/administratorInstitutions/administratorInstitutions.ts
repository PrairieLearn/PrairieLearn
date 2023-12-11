import asyncHandler = require('express-async-handler');
import express = require('express');
import * as sqldb from '@prairielearn/postgres';

import { AdministratorInstitutions, InstitutionRowSchema } from './administratorInstitutions.html';
import { getAvailableTimezonesByName } from '../../lib/timezones';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionRowSchema);
    const availableTimezones = await getAvailableTimezonesByName();
    res.send(
      AdministratorInstitutions({ institutions, availableTimezones, resLocals: res.locals }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_institution') {
      await sqldb.queryAsync(sql.add_institution, {
        short_name: req.body.short_name,
        long_name: req.body.long_name,
        display_timezone: req.body.display_timezone,
        uid_regexp: req.body.uid_regexp,
      });
    }

    res.redirect('./institutions');
  }),
);

export default router;
