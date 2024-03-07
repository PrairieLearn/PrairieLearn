//@ts-check
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
const express = require('express');
const sqldb = require('@prairielearn/postgres');

const { AdministratorNetworks } = require('./administratorNetworks.html');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select, []);
    _.assign(res.locals, result.rows[0]);
    res.send(AdministratorNetworks({ resLocals: res.locals }));
  }),
);

module.exports = router;
