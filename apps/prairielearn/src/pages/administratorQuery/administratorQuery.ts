import * as path from 'node:path';

import express from 'express';
import asyncHandler from 'express-async-handler';

import { stringify } from '@prairielearn/csv';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import type { AdministratorQueryResult } from '../../admin_queries/util.js';
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

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    const jsonFilename = req.params.query + '.json';
    const queryFilename = req.params.query + '.js';

    const info = AdministratorQuerySchema.parse(
      await jsonLoad.readJSON(path.join(queriesDir, jsonFilename)),
    );

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
    const queryFilename = req.params.query + '.js';

    const info = AdministratorQuerySchema.parse(
      await jsonLoad.readJSON(path.join(queriesDir, jsonFilename)),
    );

    const queryParams: Record<string, string> = {};
    info.params?.forEach((p) => {
      queryParams[p.name] = req.body[p.name];
    });

    let error: string | null = null;
    let result: AdministratorQueryResult | null = null;
    try {
      const module = await import(path.join(queriesDir, queryFilename));
      result = (await module.default(queryParams)) as AdministratorQueryResult;
    } catch (err) {
      logger.error(err);
      error = err.toString();
    }

    const query_run_id = await sqldb.queryRow(
      sql.insert_query_run,
      {
        name: req.params.query,
        params: queryParams,
        authn_user_id: res.locals.authn_user.user_id,
        error,
        // While rowCount is not used in the frontend, it used to be required,
        // so it is included in the result object for backwards compatibility if
        // a newer query run is viewed in an older version of this page.
        result: result ? { ...result, rowCount: result.rows.length } : null,
      },
      IdSchema,
    );
    res.redirect(`${req.baseUrl}${req.path}?query_run_id=${query_run_id}`);
  }),
);

export default router;
