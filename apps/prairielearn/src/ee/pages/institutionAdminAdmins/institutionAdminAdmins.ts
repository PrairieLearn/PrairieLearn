import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryValidatedRows, runInTransactionAsync } from '@prairielearn/postgres';

import { parseUidsString } from '../../../lib/user.js';
import { selectUserByUid } from '../../../models/user.js';
import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz.js';
import {
  deleteInstitutionAdministrator,
  ensureInstitutionAdministrator,
} from '../../models/institution-administrator.js';

import {
  InstitutionAdminAdmins,
  InstitutionAdminAdminsRowSchema,
} from './institutionAdminAdmins.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

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

          await ensureInstitutionAdministrator({
            user_id: user.user_id,
            institution_id: institution.id,
            authn_user_id: res.locals.authn_user.user_id,
          });

          validUids.push(uid);
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
      await deleteInstitutionAdministrator({
        institution_id: institution.id,
        unsafe_institution_administrator_id: req.body.unsafe_institution_administrator_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      flash('notice', 'Removed institution administrator.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
