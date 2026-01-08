import { Router } from 'express';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { typedAsyncHandler } from '../../lib/res-locals.js';

import {
  AdministratorNetworks,
  type AdministratorNetworksRow,
  AdministratorNetworksRowSchema,
} from './administratorNetworks.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<
    'plain',
    {
      networks: AdministratorNetworksRow[];
    }
  >(async (req, res) => {
    const result = await sqldb.queryRow(sql.select, z.array(AdministratorNetworksRowSchema));
    res.locals.networks = result;
    res.send(AdministratorNetworks({ resLocals: res.locals }));
  }),
);

export default router;
