import * as fsPromises from 'node:fs/promises';
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
const queriesDir = path.resolve(import.meta.dirname, '..', '..', 'admin_queries');

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
        return {
          ...contents,
          // If the JS file can be imported, we assume that the query is a JS
          // module, otherwise we assume it is a generic SQL query. We don't
          // actually use the result of the import, we just use the fact that it
          // doesn't throw an error.
          type: await import(path.join(queriesDir, `${filePrefix}.js`)).then(
            () => 'Module',
            () => 'SQL',
          ),
          filePrefix,
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
