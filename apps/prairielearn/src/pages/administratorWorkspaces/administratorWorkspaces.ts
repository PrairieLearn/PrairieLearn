import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { AdministratorWorkspaces, WorkspaceHostRowSchema } from './administratorWorkspaces.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
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
