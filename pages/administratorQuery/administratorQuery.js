const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const fsPromises = require('fs').promises;
const path = require('path');
const _ = require('lodash');
const hljs = require('highlight.js');

const csvMaker = require('../../lib/csv-maker');
const jsonLoad = require('../../lib/json-load');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const queriesDir = 'admin_queries';
const schemaFilename = 'schemas/schemas/adminQuery.json';

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    res.locals.jsonFilename = req.params.query + '.json';
    res.locals.sqlFilename = req.params.query + '.sql';

    res.locals.info = await jsonLoad.readJSONAsync(path.join(queriesDir, res.locals.jsonFilename));
    const schema = await jsonLoad.readJSONAsync(schemaFilename);
    await jsonLoad.validateJSONAsync(res.locals.info, schema);
    res.locals.sql = await fsPromises.readFile(path.join(queriesDir, res.locals.sqlFilename), {
      encoding: 'utf8',
    });
    res.locals.sqlHighlighted = hljs.highlight(res.locals.sql, {
      language: 'sql',
    }).value;

    res.locals.has_query_run = false;
    if (req.query.query_run_id) {
      const query_run = await sqldb.queryOneRowAsync(sql.select_query_run, {
        query_run_id: req.query.query_run_id,
      });

      res.locals.has_query_run = true;
      res.locals.query_run_id = req.query.query_run_id;
      res.locals.formatted_date = query_run.rows[0].formatted_date;
      res.locals.sql = query_run.rows[0].sql;
      res.locals.params = query_run.rows[0].params;
      res.locals.error = query_run.rows[0].error;
      res.locals.result = query_run.rows[0].result;
    }

    if (!res.locals.has_query_run && res.locals.info.params == null) {
      // if we don't have any params, do an immediate POST to run the query
      req.method = 'POST';
      return next();
    }

    if (req.query.format === 'json') {
      res.attachment(req.params.query + '.json');
      res.send(res.locals.result.rows);
    } else if (req.query.format === 'csv') {
      res.attachment(req.params.query + '.csv');
      res.send(await csvMaker.resultToCsvAsync(res.locals.result));
    } else {
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  })
);

router.post(
  '/:query',
  asyncHandler(async (req, res, _next) => {
    const jsonFilename = req.params.query + '.json';
    const sqlFilename = req.params.query + '.sql';

    const info = await jsonLoad.readJSONAsync(path.join(queriesDir, jsonFilename));
    const querySql = await fsPromises.readFile(path.join(queriesDir, sqlFilename), {
      encoding: 'utf8',
    });

    const queryParams = _.pick(
      req.body,
      _.map(info.params || {}, (p) => p.name)
    );
    const params = {
      name: req.params.query,
      sql: querySql,
      params: JSON.stringify(queryParams),
      authn_user_id: res.locals.authn_user.user_id,
      error: null,
      result: null,
    };
    try {
      const result = await sqldb.queryAsync(querySql, queryParams);
      params.result = JSON.stringify({
        rowCount: result.rowCount,
        columns: _.map(result.fields, (f) => f.name),
        rows: result.rows,
      });
    } catch (err) {
      params.error = err.toString();
    }

    const result = await sqldb.queryOneRowAsync(sql.insert_query_run, params);
    const query_run_id = result.rows[0].id;
    res.redirect(`${req.baseUrl}${req.path}?query_run_id=${query_run_id}`);
  })
);

module.exports = router;
