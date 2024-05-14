// @ts-check
import asyncHandler from 'express-async-handler';
import * as express from 'express';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.access_rules = await sqldb.queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      z.object({
        uids: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        institution: z.string(),
      }),
    );

    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
