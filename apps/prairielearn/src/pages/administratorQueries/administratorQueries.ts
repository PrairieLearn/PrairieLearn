import { z } from 'zod';
import * as express from 'express';
import * as fsPromises from 'node:fs/promises';
import * as path from 'path';
import asyncHandler = require('express-async-handler');

import * as jsonLoad from '../../lib/json-load';
import { AdministratorQueries } from './administratorQueries.html';

const router = express.Router();
const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

const AdministratorQueryJsonParamsSchema = z.object({
  name: z.string(),
  description: z.string(),
  default: z.string().nullable(),
  comment: z.string().nullable(),
});

const AdministratorQueryJsonSchema = z.object({
  description: z.string(),
  resultFormats: z
    .object({
      description: z.string().nullable(),
      additionalProperties: z.object({
        query: z.string(),
      }),
    })
    .nullable(),
  comment: z.string().nullable(),
  params: z.array(AdministratorQueryJsonParamsSchema).nullable(),
});

const AdministratorQueriesSchema = z.array(
  z.object({
    description: z.string(),
    resultFormats: z
      .object({
        description: z.string().nullable(),
        additionalProperties: z.object({
          query: z.string().nullable(),
        }),
      })
      .nullable(),
    comment: z.string().nullable(),
    params: z.array(AdministratorQueryJsonParamsSchema).nullable(),
    sqlFilename: z.string(),
    link: z.string(),
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = fileList.filter((f) => /\.json$/.test(f));
    const queries = AdministratorQueriesSchema.parse(
      await Promise.all(
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
      ),
    );
    console.log(queries);
    res.send(
      AdministratorQueries({
        resLocals: res.locals,
        queries,
      }),
    );
  }),
);

export default router;
