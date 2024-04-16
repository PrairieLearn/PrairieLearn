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
import { selectUserByUid } from '../../../models/user';
import { parseUidsString } from '../../../lib/user';
import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    const rows = await queryValidatedRows(
      sql.select_admins,
      { institution_id: institution.id },
      InstitutionAdminAdminsRowSchema,
    );

    res.send(InstitutionAdminAdmins({ institution, rows, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    if (req.body.__action === 'addAdmins') {
      const uids = parseUidsString(req.body.uids, 10);
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
          console.log(institution.id, user.user_id);
          await queryAsync(sql.insert_institution_admin, {
            institution_id: institution.id,
            user_id: user.user_id,
          });
          validUids.push(uid);
        }
      });

      if (validUids.length > 0) {
        flash('success', `Successfully added institution admins: ${validUids.join(', ')}`);
      }

      // TODO: guard against user enumeration somehow? Maybe limit users to
      // those within the institution?
      if (invalidUids.length > 0) {
        flash('error', `Could not add the following unknown users: ${invalidUids.join(', ')}`);
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'removeAdmin') {
      // TODO: record audit event for this action.
      await queryAsync(sql.delete_institution_admin, {
        institution_id: institution.id,
        institution_administrator_id: req.body.unsafe_institution_administrator_id,
      });
      flash('notice', 'Removed institution administrator.');
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
