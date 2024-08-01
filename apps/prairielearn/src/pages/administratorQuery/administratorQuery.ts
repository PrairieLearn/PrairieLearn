import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import express from 'express';
import asyncHandler from 'express-async-handler';
import hljs from 'highlight.js';

import { stringify } from '@prairielearn/csv';
import * as sqldb from '@prairielearn/postgres';

import type { AdministratorQueryResult } from '../../admin_queries/index.types.js';
import { IdSchema, type QueryRun, QueryRunSchema } from '../../lib/db-types.js';
import * as jsonLoad from '../../lib/json-load.js';

import {
  AdministratorQuery,
  AdministratorQuerySchema,
  QueryRunRowSchema,
} from './administratorQuery.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const queriesDir = path.resolve(import.meta.dirname, '..', '..', 'admin_queries');

export interface AdministratorQueryRunParams {
  name: string;
  sql: string;
  params: Record<string, any>;
  authn_user_id: string;
  error?: string | null;
  result: AdministratorQueryResult | null;
}

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    const jsonFilename = req.params.query + '.json';
    const jsFilename = req.params.query + '.js';
    const sqlFilename = req.params.query + '.sql';
    let queryFilename = jsFilename;

    const info = AdministratorQuerySchema.parse(
      await jsonLoad.readJSON(path.join(queriesDir, jsonFilename)),
    );
    let querySql: string | null = null,
      sqlHighlighted: string | null = null;
    await import(path.join(queriesDir, jsFilename)).catch(async () => {
      queryFilename = sqlFilename;
      querySql = await fs.readFile(path.join(queriesDir, sqlFilename), { encoding: 'utf8' });
      sqlHighlighted = hljs.highlight(querySql, { language: 'sql' }).value;
    });

    let query_run_id: string | null = null;
    let query_run: QueryRun | null = null;
    if (req.query.query_run_id) {
      query_run_id = IdSchema.parse(req.query.query_run_id);
      query_run = await sqldb.queryRow(sql.select_query_run, { query_run_id }, QueryRunSchema);
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
        stringify(query_run.result?.rows, {
          header: true,
          columns: query_run.result?.columns,
        }).pipe(res);
      } else {
        res.send('');
      }
    } else {
      const recent_query_runs = await sqldb.queryRows(
        sql.select_recent_query_runs,
        { query_name: req.params.query },
        QueryRunRowSchema,
      );
      res.send(
        AdministratorQuery({
          resLocals: res.locals,
          query_run_id,
          query_run,
          queryFilename,
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
    const jsFilename = req.params.query + '.js';
    const sqlFilename = req.params.query + '.sql';

    const info = AdministratorQuerySchema.parse(
      await jsonLoad.readJSON(path.join(queriesDir, jsonFilename)),
    );

    const queryParams = {};
    info.params?.forEach((p) => {
      queryParams[p.name] = req.body[p.name];
    });

    let querySql = '';
    let error: string | null = null;
    let result: AdministratorQueryResult | null = null;
    try {
      result = await import(path.join(queriesDir, jsFilename)).then(
        async (module) => {
          // TODO Decide what is saved in the `sql` column of the `query_runs` table
          return (await module.default(queryParams)) as AdministratorQueryResult;
        },
        async (err) => {
          console.log(err);
          querySql = await fs.readFile(path.join(queriesDir, sqlFilename), { encoding: 'utf8' });
          const queryResult = await sqldb.queryAsync(querySql, queryParams);
          return {
            columns: queryResult.fields.map((f) => f.name),
            rows: queryResult.rows,
          };
        },
      );
    } catch (err) {
      error = err.toString();
    }

    const query_run_id = await sqldb.queryRow(
      sql.insert_query_run,
      {
        name: req.params.query,
        sql: querySql,
        params: queryParams,
        authn_user_id: res.locals.authn_user.user_id,
        error,
        result,
      },
      IdSchema,
    );
    res.redirect(`${req.baseUrl}${req.path}?query_run_id=${query_run_id}`);
  }),
);

export default router;
