import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';

import { AdministratorWorkspaces, WorkspaceHostRowSchema } from './administratorWorkspaces.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

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
