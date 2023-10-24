import express = require('express');
const router = express.Router();
import asyncHandler = require('express-async-handler');
import fsPromises = require('node:fs/promises');
import path = require('path');
import hljs from 'highlight.js';
import { stringify } from '@prairielearn/csv';
import { z } from 'zod';

import jsonLoad = require('../../lib/json-load');
import sqldb = require('@prairielearn/postgres');
import {
  AdministratorQuery,
  AdministratorQueryParamsRecord,
  AdministratorQueryResult,
  AdministratorQuerySchema,
  AdministratorQueryQueryRunSchema,
  AdministratorQueryRunParams,
} from './administratorQuery.html';

const sql = sqldb.loadSqlEquiv(__filename);

const queriesDir = path.resolve(__dirname, '..', '..', 'admin_queries');

const AdministratorQueryQueryRunIDSchema = z.string();

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    const jsonFilename = req.params.query + '.json';
    const sqlFilename = req.params.query + '.sql';

    const info = AdministratorQuerySchema.parse(
      await jsonLoad.readJSONAsync(path.join(queriesDir, jsonFilename)),
    );
    const querySql = await fsPromises.readFile(path.join(queriesDir, sqlFilename), {
      encoding: 'utf8',
    });
    const sqlHighlighted = hljs.highlight(querySql, {
      language: 'sql',
    }).value;

    let has_query_run = false;
    let query_run_id: string | null = null;
    let formatted_date: string | undefined = undefined;
    let params: AdministratorQueryParamsRecord | undefined = undefined;
    let error: string | null = null;
    let result: AdministratorQueryResult = {
      rows: [],
      rowCount: 0,
      columns: [],
    };
    if (req.query.query_run_id) {
      const query_run = await sqldb.queryRow(
        sql.select_query_run,
        {
          query_run_id: req.query.query_run_id,
        },
        AdministratorQueryQueryRunSchema,
      );
      has_query_run = true;
      query_run_id = AdministratorQueryQueryRunIDSchema.parse(req.query.query_run_id);
      formatted_date = query_run.formatted_date;
      res.locals.sql = query_run.sql;
      params = query_run.params;
      error = query_run.error;
      result = query_run.result;
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
          sqlHighlighted,
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
    if (info.params) {
      info.params.forEach((p) => {
        queryParams[p.name] = req.body[p.name];
      });
    }

    const params: AdministratorQueryRunParams = {
      name: req.params.query,
      sql: querySql,
      params: queryParams,
      authn_user_id: res.locals.authn_user.user_id,
      error: null,
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
    const result = await sqldb.queryRow(
      sql.insert_query_run,
      params,
      AdministratorQueryQueryRunIDSchema,
    );
    const query_run_id = result;
    res.redirect(`${req.baseUrl}${req.path}?query_run_id=${query_run_id}`);
  }),
);

export default router;
