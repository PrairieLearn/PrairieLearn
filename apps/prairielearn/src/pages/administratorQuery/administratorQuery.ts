import express = require('express');
const router = express.Router();
import asyncHandler = require('express-async-handler');
import fsPromises = require('node:fs/promises');
import path = require('path');
import _ = require('lodash');
import hljs from 'highlight.js';
import { stringify } from '@prairielearn/csv';
import { z } from 'zod';

import jsonLoad = require('../../lib/json-load');
import sqldb = require('@prairielearn/postgres');
import {
  AdministratorQuery,
  AdministratorQueryRunParams,
  AdministratorQueryResult,
} from './administratorQuery.html';

const sql = sqldb.loadSqlEquiv(__filename);

const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');
const schemaFilename = path.resolve(__dirname, '..', '..', 'schemas', 'schemas', 'adminQuery.json');

const AdministratorQueryQueryRunSchema = z.string();
const AdministratorQueryResultSchema = z.object({
  rows: z.array(z.object({})),
  rowCount: z.number(),
  columns: z.array(z.string()),
});

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    const jsonFilename = req.params.query + '.json';
    const sqlFilename = req.params.query + '.sql';

    const info = await jsonLoad.readJSONAsync(path.join(queriesDir, jsonFilename));
    const schema = await jsonLoad.readJSONAsync(schemaFilename);
    await jsonLoad.validateJSONAsync(info, schema);
    res.locals.sql = await fsPromises.readFile(path.join(queriesDir, sqlFilename), {
      encoding: 'utf8',
    });
    res.locals.sqlHighlighted = hljs.highlight(res.locals.sql, {
      language: 'sql',
    }).value;

    let has_query_run = false;
    let query_run_id: string | null = null;
    let formatted_date: string | null = null;
    let params: AdministratorQueryRunParams | null = null;
    let error: string | null = null;
    let result: AdministratorQueryResult = AdministratorQueryResultSchema.parse({
      rows: [],
      rowCount: 0,
      columns: [],
    });
    if (req.query.query_run_id) {
      const query_run = await sqldb.queryOneRowAsync(sql.select_query_run, {
        query_run_id: req.query.query_run_id,
      });
      has_query_run = true;
      query_run_id = AdministratorQueryQueryRunSchema.parse(req.query.query_run_id);
      formatted_date = query_run.rows[0].formatted_date;
      res.locals.sql = query_run.rows[0].sql;
      params = query_run.rows[0].params;
      error = query_run.rows[0].error;
      result = query_run.rows[0].result;
    }

    if (!has_query_run && info.params == null) {
      // if we don't have any params, do an immediate POST to run the query
      req.method = 'POST';
      return next();
    }

    if (req.query.format === 'json') {
      res.attachment(req.params.query + '.json');
      res.send(result.rows);
    } else if (req.query.format === 'csv') {
      res.attachment(req.params.query + '.csv');
      stringify(result.rows, {
        header: true,
        columns: result.columns,
      }).pipe(res);
    } else {
      const recentQueryRuns = await sqldb.queryAsync(sql.select_recent_query_runs, {
        query_name: req.params.query,
      });
      res.locals.recent_query_runs = recentQueryRuns.rows;
      res.send(
        AdministratorQuery({
          resLocals: res.locals,
          has_query_run,
          query_run_id,
          formatted_date,
          params,
          error,
          result,
          sqlFilename,
          info,
        }),
      );
    }
  }),
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

    const queryParams = {};
    info.params.forEach((p) => {
      queryParams[p.name] = req.body[p.name];
    });

    const params: AdministratorQueryRunParams = {
      name: req.params.query,
      sql: querySql,
      params: JSON.stringify(queryParams),
      authn_user_id: res.locals.authn_user.user_id,
      error: null,
      result: null,
      formatted_date: null,
    };
    try {
      const result = await sqldb.queryAsync(querySql, queryParams);
      params.result = {
        rowCount: result.rowCount,
        columns: result.fields.map((f) => f.name),
        rows: result.rows,
      };
    } catch (err) {
      params.error = err.toString();
    }
    const result = await sqldb.queryOneRowAsync(sql.insert_query_run, params);
    const query_run_id = result.rows[0].id;
    res.redirect(`${req.baseUrl}${req.path}?query_run_id=${query_run_id}`);
  }),
);

export default router;
