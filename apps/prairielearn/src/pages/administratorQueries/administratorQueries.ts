import * as fsPromises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as jsonLoad from '../../lib/json-load.js';


import {
  AdministratorQueries,
  type AdministratorQuery,
  AdministratorQueryJsonSchema,
} from './administratorQueries.html.js';

const router = express.Router();
const queriesDir = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'admin_queries');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = fileList.filter((f) => /\.json$/.test(f));
    const queries: AdministratorQuery[] = await Promise.all(
      jsonList.map(async (f) => {
        const contents = AdministratorQueryJsonSchema.parse(
          await jsonLoad.readJSON(path.join(queriesDir, f)),
        );
        const filePrefix = f.replace(/\.json$/, '');
        return { ...contents, filePrefix };
      }),
    );
    res.send(
      AdministratorQueries({
        resLocals: res.locals,
        queries,
      }),
    );
  }),
);

export default router;
