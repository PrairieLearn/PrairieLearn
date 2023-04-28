const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const fsPromises = require('fs').promises;
const path = require('path');
const _ = require('lodash');

const jsonLoad = require('../../lib/json-load');

const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const fileList = await fsPromises.readdir(queriesDir);
    const jsonList = _.filter(fileList, (f) => /\.json$/.test(f));
    res.locals.queries = await Promise.all(
      jsonList.map(async (f) => {
        const contents = await jsonLoad.readJSONAsync(path.join(queriesDir, f));
        contents.sqlFilename = f.replace(/\.json$/, '.sql');
        contents.link = f.replace(/\.json$/, '');
        return contents;
      })
    );
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
