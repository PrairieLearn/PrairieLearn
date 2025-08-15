import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { ExamModeNetworkSchema } from '../../lib/db-types.js';

import { AdministratorNetworks } from './administratorNetworks.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryRow(
      sql.select,
      z.array(
        z.object({
          network: ExamModeNetworkSchema.shape.network,
          start_date: z.string(),
          end_date: z.string(),
          location: ExamModeNetworkSchema.shape.location,
          purpose: ExamModeNetworkSchema.shape.purpose,
        }),
      ),
    );
    res.locals.networks = result;
    res.send(AdministratorNetworks({ resLocals: res.locals }));
  }),
);

export default router;
