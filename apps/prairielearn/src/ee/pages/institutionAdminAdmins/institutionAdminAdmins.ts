import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import {
  InstitutionAdminAdmins,
  InstitutionAdminAdminsRowSchema,
} from './institutionAdminAdmins.html';
import { getInstitution } from '../../lib/institution';
import { parseUidsString } from '../../../lib/user';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: authenticate the the user can access this institution.
    // TODO: do the same on other institution admin pages as well.
    const institution = await getInstitution(req.params.institution_id);
    const rows = await queryValidatedRows(
      sql.select_admins,
      {
        institution_id: req.params.institution_id,
      },
      InstitutionAdminAdminsRowSchema,
    );
    res.send(InstitutionAdminAdmins({ institution, rows, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'addAdmins') {
      console.log(req.body);
      const uids = parseUidsString(req.body.uids);
      console.log(uids);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
