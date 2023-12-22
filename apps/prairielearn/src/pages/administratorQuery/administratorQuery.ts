import express = require('express');
const router = express.Router();
import asyncHandler = require('express-async-handler');
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import hljs from 'highlight.js';
import { stringify } from '@prairielearn/csv';
import { z } from 'zod';

import * as jsonLoad from '../../lib/json-load';
import * as sqldb from '@prairielearn/postgres';
import {
  AdministratorQuery,
  AdministratorQuerySchema,
  AdministratorQueryQueryRunSchema,
  AdministratorQueryRunParams,
  AdministratorQueryQueryRun,
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
      await jsonLoad.readJSON(path.join(queriesDir, jsonFilename)),
    );
    const querySql = await fs.readFile(path.join(queriesDir, sqlFilename), {
      encoding: 'utf8',
    });
    const sqlHighlighted = hljs.highlight(querySql, {
      language: 'sql',
    }).value;

    let query_run_id: string | null = null;
    let query_run: AdministratorQueryQueryRun | null = null;
    if (req.query.query_run_id) {
      query_run_id = AdministratorQueryQueryRunIDSchema.parse(req.query.query_run_id);
      query_run = await sqldb.queryRow(
        sql.select_query_run,
        {
          query_run_id,
        },
        AdministratorQueryQueryRunSchema,
      );
    }

    if (!query_run && info.params == null) {
      // if we don't have any params, do an immediate POST to run the query
      req.method = 'POST';
      return next();
    }

    if (req.query.format === 'json') {
      res.attachment(req.params.query + '.json');
      res.send(query_run?.result?.rows);
    } else if (req.query.format === 'csv') {
      res.attachment(req.params.query + '.csv');
      if (query_run?.result != null) {
        stringify(query_run.result.rows, {
          header: true,
          columns: query_run.result.columns,
        }).pipe(res);
      } else {
        res.send('');
      }
    } else {
      const recentQueryRuns = await sqldb.queryAsync(sql.select_recent_query_runs, {
        query_name: req.params.query,
      });
      const recent_query_runs: AdministratorQueryQueryRun[] = recentQueryRuns.rows;
      res.send(
        AdministratorQuery({
          resLocals: res.locals,
          query_run_id,
          query_run,
          sqlFilename,
          info,
          sqlHighlighted,
          recent_query_runs,
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

    const info = await jsonLoad.readJSON(path.join(queriesDir, jsonFilename));
    const querySql = await fs.readFile(path.join(queriesDir, sqlFilename), {
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
      result: null,
    };
    try {
      const result = await sqldb.queryAsync(querySql, queryParams);
      params.result = {
        rowCount: result.rowCount ?? 0,
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
