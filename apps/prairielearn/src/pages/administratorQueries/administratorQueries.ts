import * as fsPromises from 'node:fs/promises';
import * as path from 'path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadAdminQueryModule } from '../../admin_queries/lib/util.js';

import { AdministratorQueries, type AdministratorQuery } from './administratorQueries.html.js';

const router = Router();
const queriesDir = path.resolve(import.meta.dirname, '..', '..', 'admin_queries');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const moduleList = fileList.filter((f) => /\.[tj]s$/.test(f));
    const queries: AdministratorQuery[] = await Promise.all(
      moduleList.map(async (f) => {
        const filePrefix = f.replace(/\.[tj]s$/, '');
        const module = await loadAdminQueryModule(filePrefix).catch((error) => ({
          specs: { description: `Error loading query ${filePrefix}`, error: error.message },
        }));
        return { ...module.specs, filePrefix };
      }),
    );
    res.send(AdministratorQueries({ resLocals: res.locals, queries }));
  }),
);

export default router;
