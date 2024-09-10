import express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { UserSchema } from '../../lib/db-types.js';

import { AdministratorAdmins } from './administratorAdmins.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const admins = await sqldb.queryRows(sql.select_admins, [], UserSchema);
    res.send(AdministratorAdmins({ admins, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'administrators_insert_by_user_uid') {
      await sqldb.callAsync('administrators_insert_by_user_uid', [
        req.body.uid,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'administrators_delete_by_user_id') {
      await sqldb.callAsync('administrators_delete_by_user_id', [
        req.body.user_id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
