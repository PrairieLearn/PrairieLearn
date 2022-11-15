const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const { WorkspaceLogs } = require('./workspaceLogs.html');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (_req, res, _next) => {
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_logs, {
      workspace_id: res.locals.workspace_id,
    });
    res.send(WorkspaceLogs({ workspaceLogs: workspaceLogs.rows, resLocals: res.locals }));
  })
);

module.exports = router;
