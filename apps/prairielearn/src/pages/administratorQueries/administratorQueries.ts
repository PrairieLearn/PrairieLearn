import express = require('express');
const router = express.Router();
import asyncHandler = require('express-async-handler');
const fsPromises = require('fs').promises;
import path = require('path');
import _ = require('lodash');

import jsonLoad = require('../../lib/json-load');
import { AdministratorQueries } from './administratorQueries.html';

const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = _.filter(fileList, (f) => /\.json$/.test(f));
    const queries = await Promise.all(
      jsonList.map(async (f) => {
        const contents = await jsonLoad.readJSONAsync(path.join(queriesDir, f));
        contents.sqlFilename = f.replace(/\.json$/, '.sql');
        contents.link = f.replace(/\.json$/, '');
        return contents;
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
