const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');
  var params = {
    assessment_id: res.locals.assessment.id,
    link_exam_id: config.syncExamIdAccessRules,
  };
  sqldb.query(sql.assessment_access_rules, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.access_rules = result.rows;
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

module.exports = router;
