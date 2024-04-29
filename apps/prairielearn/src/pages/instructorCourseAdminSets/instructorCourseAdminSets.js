// @ts-check
const asyncHandler = require('express-async-handler');

import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';
import { AssessmentSetSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.assessment_sets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: res.locals.course.id },
      AssessmentSetSchema,
    );

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
