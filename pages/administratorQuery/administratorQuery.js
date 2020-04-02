const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler')
const fsPromises = require('fs').promises;
const path = require('path');
const util = require('util');
const _ = require('lodash');

const { sqldb } = require('@prairielearn/prairielib');
const csvMaker = require('../../lib/csv-maker');
const jsonLoad = require('../../lib/json-load');

const queriesDir = 'admin_queries';

router.get('/:query', asyncHandler(async (req, res, next) => {
    res.locals.jsonFilename = req.params.query + '.json'
    res.locals.sqlFilename = req.params.query + '.sql'

    res.locals.info = await jsonLoad.readJSONAsync(path.join(queriesDir, res.locals.jsonFilename));
    res.locals.sql = await fsPromises.readFile(path.join(queriesDir, res.locals.sqlFilename), {encoding: 'utf8'});
    res.locals.result = await sqldb.queryAsync(res.locals.sql, []);

    if (req.query._format == 'json') {
        res.attachment(req.params.query + '.json');
        res.send(res.locals.result.rows);
    } else if (req.query._format == 'csv') {
        res.attachment(req.params.query + '.csv');
        res.send(await csvMaker.resultToCsvAsync(res.locals.result));
    } else {
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
}));

module.exports = router;
