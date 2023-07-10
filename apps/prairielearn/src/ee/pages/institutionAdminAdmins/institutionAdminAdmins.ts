import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryAsync,
  queryValidatedRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  InstitutionAdminAdmins,
  InstitutionAdminAdminsRowSchema,
} from './institutionAdminAdmins.html';
import { getInstitution } from '../../lib/institution';
import { parseUidsString, selectUserByUid } from '../../../lib/user';

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
      const validUids: string[] = [];
      const invalidUids: string[] = [];
      await runInTransactionAsync(async () => {
        for (const uid of uids) {
          const user = await selectUserByUid(uid);

          if (!user) {
            // TODO: should we use an invitation system here instead?
            invalidUids.push(uid);
            continue;
          }

          // TODO: record audit event for this action.
          console.log(req.params.institution_id, user.user_id);
          await queryAsync(sql.insert_institution_admin, {
            institution_id: req.params.institution_id,
            user_id: user.user_id,
          });
          validUids.push(uid);
        }
      });

      if (validUids.length > 0) {
        flash('success', `Successfully added institution admins: ${validUids.join(', ')}`);
      }

      if (invalidUids.length > 0) {
        flash('error', `Could not add the following unknown users: ${invalidUids.join(', ')}`);
      }

      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
