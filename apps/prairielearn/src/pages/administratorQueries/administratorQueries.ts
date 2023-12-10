import * as express from 'express';
import * as fsPromises from 'node:fs/promises';
import * as path from 'path';
import asyncHandler = require('express-async-handler');

import * as jsonLoad from '../../lib/json-load';
import { AdministratorQueries, AdministratorQueryJsonSchema } from './administratorQueries.html';

const router = express.Router();
const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = fileList.filter((f) => /\.json$/.test(f));
    const queries = await Promise.all(
      jsonList.map(async (f) => {
        const contents = AdministratorQueryJsonSchema.parse(
          await jsonLoad.readJSON(path.join(queriesDir, f)),
        );
        return {
          ...contents,
          sqlFilename: f.replace(/\.json$/, '.sql'),
          link: f.replace(/\.json$/, ''),
        };
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
