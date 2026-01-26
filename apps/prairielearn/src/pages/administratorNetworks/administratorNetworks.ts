import { Router } from 'express';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { typedAsyncHandler } from '../../lib/res-locals.js';

import {
  AdministratorNetworks,
  AdministratorNetworksRowSchema,
} from './administratorNetworks.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const networks = await sqldb.queryRow(sql.select, z.array(AdministratorNetworksRowSchema));
    res.send(AdministratorNetworks({ resLocals: res.locals, networks }));
  }),
);

export default router;
