import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { AdministratorSchema, UserSchema } from '../../lib/db-types.js';

import { AdministratorAdmins } from './administratorAdmins.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const admins = await sqldb.queryRows(sql.select_admins, UserSchema);
    res.send(AdministratorAdmins({ admins, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'administrators_insert_by_user_uid') {
      const administrator = await sqldb.queryOptionalRow(
        sql.insert_admin_by_user_uid,
        { uid: req.body.uid, authn_user_id: res.locals.authn_user.id },
        AdministratorSchema,
      );
      if (administrator == null) {
        throw new error.HttpStatusError(400, `No user with uid ${req.body.uid}`);
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'administrators_delete_by_user_id') {
      await sqldb.queryRow(
        sql.delete_admin_by_user_id,
        { user_id: req.body.user_id, authn_user_id: res.locals.authn_user.id },
        AdministratorSchema,
      );
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
