// @ts-check
import asyncHandler from 'express-async-handler';
import _ from 'lodash';
import { Router } from 'express';
import * as sqldb from '@prairielearn/postgres';

import { AdministratorNetworks } from './administratorNetworks.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select, []);
    _.assign(res.locals, result.rows[0]);
    res.send(AdministratorNetworks({ resLocals: res.locals }));
  }),
);

export default router;
