import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  AdministratorNetworks,
  AdministratorNetworksRowSchema,
} from './administratorNetworks.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryRow(sql.select, z.array(AdministratorNetworksRowSchema));
    res.locals.networks = result;
    res.send(AdministratorNetworks({ resLocals: res.locals }));
  }),
);

export default router;
