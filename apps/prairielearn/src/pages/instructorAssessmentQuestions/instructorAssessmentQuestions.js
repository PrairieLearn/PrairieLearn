// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
const _ = require('lodash');
import AnsiUp from 'ansi_up';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { AssessmentQuestionSchema } from '../../lib/db-types';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questions = await sqldb.queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionSchema.extend({
        number: z.string().nullable(),
        sync_errors: z.string().nullable(),
        sync_errors_ansified: z.string().optional(),
        sync_warnings: z.string().nullable(),
        sync_warnings_ansified: z.string().optional(),
      }),
    );
    res.locals.questions = questions.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
  }),
);

export default router;
