import asyncHandler = require('express-async-handler');
import express = require('express');
import sqldb = require('@prairielearn/postgres');

import { AdministratorInstitutions, InstitutionSchema } from './administratorInstitutions.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionSchema);
    res.send(AdministratorInstitutions({ institutions, resLocals: res.locals }));
  })
);

export default router;
