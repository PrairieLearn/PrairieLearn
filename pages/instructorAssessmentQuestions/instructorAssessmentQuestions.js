const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const _ = require('lodash');
const { default: AnsiUp } = require('ansi_up');
const ansiUp = new AnsiUp();

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

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

router.post('/', function (req, res, next) {
  console.log("new")
  if (req.body.__action === 'break') {
    var params = {
      assessment_question_id: req.body.__assessment_question_id,
      authn_user_id: res.locals.authn_user.user_id,
    };
    sqldb.query(sql.mark_all_variants_broken, params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  }
});

module.exports = router;
