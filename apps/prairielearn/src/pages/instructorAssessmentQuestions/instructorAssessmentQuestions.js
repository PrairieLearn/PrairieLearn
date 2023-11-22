// @ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const _ = require('lodash');
const { default: AnsiUp } = require('ansi_up');

import * as sqldb from '@prairielearn/postgres';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');
  const params = {
    assessment_id: res.locals.assessment.id,
    course_id: res.locals.course.id,
  };
  sqldb.query(sql.questions, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.questions = _.map(result.rows, (row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

export default router;
