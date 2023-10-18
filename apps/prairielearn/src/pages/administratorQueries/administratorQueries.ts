import { z } from 'zod';
import express = require('express');
const router = express.Router();
import asyncHandler = require('express-async-handler');
import fsPromises = require('node:fs/promises');
import path = require('path');

import jsonLoad = require('../../lib/json-load');
import { AdministratorQueries } from './administratorQueries.html';

const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

const AdministratorQueryParamsSchema = z.object({
  name: z.string(),
  description: z.string(),
  default: z.string().nullable().optional(),
  comment: z.any().nullable(),
});

const AdministratorQueryJsonSchema = z.object({
  description: z.string(),
  resultFormats: z.any().nullable(),
  comment: z.any().nullable(),
  params: z.array(AdministratorQueryParamsSchema).nullable().optional(),
});
export type AdministratorQueryJson = z.infer<typeof AdministratorQueryJsonSchema>;

export type AdministratorQuery = AdministratorQueryJson & {
  sqlFilename: string;
  link: string;
};

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
        console.log('new query', f, contents);
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
