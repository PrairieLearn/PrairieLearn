// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const { loadSqlEquiv, queryValidatedRows } = require('@prairielearn/postgres');

const { config } = require('../../lib/config');
const {
  AdministratorWorkspaces,
  WorkspaceHostRowSchema,
} = require('./administratorWorkspaces.html');

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaceHostRows = await queryValidatedRows(
      sql.select_workspaces_2,
      {},
      WorkspaceHostRowSchema,
    );
    res.send(
      AdministratorWorkspaces({
        workspaceHostRows,
        workspaceLoadHostCapacity: config.workspaceLoadHostCapacity,
        resLocals: res.locals,
      }),
    );
  }),
);

module.exports = router;
