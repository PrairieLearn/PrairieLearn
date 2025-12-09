import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringify } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import {
  type AdministratorQueryResult,
  loadAdminQueryModule,
} from '../../admin_queries/lib/util.js';
import { IdSchema, type QueryRun, QueryRunSchema } from '../../lib/db-types.js';

import { AdministratorQuery, QueryRunRowSchema } from './administratorQuery.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/:query',
  asyncHandler(async (req, res, next) => {
    const module = await loadAdminQueryModule(req.params.query);
    if (module.specs.enabled === false) {
      throw new HttpStatusError(403, 'Admin query is disabled in the current environment');
    }

    let query_run_id: string | null = null;
    let query_run: QueryRun | null = null;
    if (req.query.query_run_id) {
      query_run_id = IdSchema.parse(req.query.query_run_id);
      query_run = await sqldb.queryRow(sql.select_query_run, { query_run_id }, QueryRunSchema);
    }

    if (!query_run && module.specs.params == null) {
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
          queryFilename: req.params.query,
          info: module.specs,
          recent_query_runs,
        }),
      );
    }
  }),
);

router.post(
  '/:query',
  asyncHandler(async (req, res, _next) => {
    const module = await loadAdminQueryModule(req.params.query);
    if (module.specs.enabled === false) {
      throw new HttpStatusError(403, 'Admin query is disabled in the current environment');
    }

    const queryParams: Record<string, string> = {};
    module.specs.params?.forEach((p) => {
      queryParams[p.name] = req.body[p.name];
    });

    let error: string | null = null;
    let result: AdministratorQueryResult | null = null;
    try {
      result = await module.default(queryParams);
    } catch (err: unknown) {
      logger.error(err);
      error = err instanceof Error ? err.toString() : String(err);
    }

    const query_run_id = await sqldb.queryRow(
      sql.insert_query_run,
      {
        name: req.params.query,
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
