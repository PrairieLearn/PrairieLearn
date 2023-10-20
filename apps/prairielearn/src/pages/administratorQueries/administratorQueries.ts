import { z } from 'zod';
import * as express from 'express';
import * as asyncHandler from 'express-async-handler';
import * as fsPromises from 'node:fs/promises';
import * as path from 'path';

import jsonLoad = require('../../lib/json-load');
import { AdministratorQueries, type AdministratorQuery } from './administratorQueries.html';

const router = express.Router();
const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

const AdministratorQueryJsonParamsSchema = z.object({
  name: z.string(),
  description: z.string(),
  default: z.string().nullable().optional(),
  comment: z.any().nullable(),
});

const AdministratorQueryJsonSchema = z.object({
  description: z.string(),
  resultFormats: z.any().nullable(),
  comment: z.any().nullable(),
  params: z.array(AdministratorQueryJsonParamsSchema).nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = fileList.filter((f) => /\.json$/.test(f));
    const queries = await Promise.all(
      jsonList.map(async (f) => {
        const contents = AdministratorQueryJsonSchema.parse(
          await jsonLoad.readJSONAsync(path.join(queriesDir, f)),
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
        queries: queries as AdministratorQuery[],
      }),
    );
  }),
);

export default router;
