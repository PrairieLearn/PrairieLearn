// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import AnsiUp from 'ansi_up';

import * as error from '@prairielearn/error';
import { queryAsync, loadSqlEquiv } from '@prairielearn/postgres';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await queryAsync(sql.questions, {
      assessment_id: res.locals.assessment.id,
      course_id: res.locals.course.id,
    });
    res.locals.questions = result.rows.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'break_variants') {
      await queryAsync(sql.mark_all_variants_broken, {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: req.body.assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`, {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;
