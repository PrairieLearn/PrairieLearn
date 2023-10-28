import asyncHandler = require('express-async-handler');
import * as express from 'express';
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';

import { config } from '../../lib/config';
import { AdministratorWorkspaces, WorkspaceSchema } from './administratorWorkspaces.html';

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
      }),
    );
  }),
);

export default router;
