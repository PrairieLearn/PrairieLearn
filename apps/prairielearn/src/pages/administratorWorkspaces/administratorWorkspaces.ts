import asyncHandler = require('express-async-handler');
import express = require('express');
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { AdministratorWorkspaces, WorkspaceHostRowSchema } from './administratorWorkspaces.html';

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

export default router;
