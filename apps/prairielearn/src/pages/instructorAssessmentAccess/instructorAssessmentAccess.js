// @ts-check
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const asyncHandler = require('express-async-handler');
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const assessmentAccessRulesSchema = z.object({
  mode: z.string(),
  uids: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  credit: z.string(),
  time_limit: z.string(),
  password: z.string(),
  exam_uuid: z.string().nullable(),
  ps_exam_id: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  active: z.string(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    debug('GET /');
    const params = {
      assessment_id: res.locals.assessment.id,
      link_exam_id: config.syncExamIdAccessRules,
    };
    const result = await sqldb.queryRows(
      sql.assessment_access_rules,
      params,
      assessmentAccessRulesSchema,
    );
    res.locals.access_rules = result;
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
