const asyncHandler = require('express-async-handler');
const express = require('express');
const { loadSqlEquiv, queryValidatedRows } = require('@prairielearn/postgres');

const { config } = require('../../lib/config');
const { AdministratorWorkspaces, WorkspaceSchema } = require('./administratorWorkspaces.html');

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaces = await queryValidatedRows(sql.select_workspaces, {}, WorkspaceSchema);
    res.send(
      AdministratorWorkspaces({
        workspaces,
        workspaceLoadHostCapacity: config.workspaceLoadHostCapacity,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
