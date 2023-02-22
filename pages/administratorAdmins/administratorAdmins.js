const asyncHandler = require('express-async-handler');
const express = require('express');
const sqldb = require('@prairielearn/postgres');

const error = require('../../prairielib/error');
const { AdministratorAdmins } = require('./administratorAdmins.html');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_admins, []);
    res.send(AdministratorAdmins({ admins: result.rows, resLocals: res.locals }));
  })
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
      throw error.make(400, 'unknown __action', { locals: res.locals, body: req.body });
    }
  })
);

module.exports = router;
