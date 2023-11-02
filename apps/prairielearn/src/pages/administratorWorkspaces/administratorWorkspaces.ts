import asyncHandler = require('express-async-handler');
import * as express from 'express';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { AdministratorWorkspaces, WorkspaceHostRowSchema } from './administratorWorkspaces.html';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaceHostRows = await queryRows(sql.select_workspace_hosts, WorkspaceHostRowSchema);
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
