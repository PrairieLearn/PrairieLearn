import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryRow,
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
import { insertAuditLog } from '../../../models/audit-log';
import { InstitutionAdministratorSchema } from '../../../lib/db-types';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

/**
 * The maximum number of UIDs that can be provided in a single request.
 */
const MAX_UIDS = 10;

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

    res.send(
      InstitutionAdminAdmins({
        institution,
        rows,
        uidsLimit: MAX_UIDS,
        resLocals: res.locals,
      }),
    );
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
      const uids = parseUidsString(req.body.uids, MAX_UIDS);
      const validUids: string[] = [];
      const invalidUids: string[] = [];
      await runInTransactionAsync(async () => {
        for (const uid of uids) {
          const user = await selectUserByUid(uid);

          // Specifically check that the user is in the institution to prevent
          // someone from enumerating users in other institutions.
          if (!user || user.institution_id !== institution.id) {
            invalidUids.push(uid);
            continue;
          }

          const admin = await queryRow(
            sql.insert_institution_admin,
            {
              institution_id: institution.id,
              user_id: user.user_id,
            },
            InstitutionAdministratorSchema,
          );
          validUids.push(uid);

          await insertAuditLog({
            authn_user_id: res.locals.authn_user.user_id,
            table_name: 'institution_administrators',
            action: 'insert',
            institution_id: admin.institution_id,
            user_id: admin.user_id,
            row_id: admin.id,
            new_state: admin,
          });
        }
      });

      if (validUids.length > 0) {
        flash('success', `Successfully added institution admins: ${validUids.join(', ')}`);
      }

      if (invalidUids.length > 0) {
        flash(
          'error',
          `The following users either don't exist or aren't in this institution: ${invalidUids.join(', ')}`,
        );
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'removeAdmin') {
      await runInTransactionAsync(async () => {
        const admin = await queryRow(
          sql.delete_institution_admin,
          {
            institution_id: institution.id,
            institution_administrator_id: req.body.unsafe_institution_administrator_id,
          },
          InstitutionAdministratorSchema,
        );

        await insertAuditLog({
          authn_user_id: res.locals.authn_user.user_id,
          table_name: 'institution_administrators',
          action: 'delete',
          institution_id: admin.institution_id,
          user_id: admin.user_id,
          row_id: admin.id,
          old_state: admin,
        });
      });
      flash('notice', 'Removed institution administrator.');
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
