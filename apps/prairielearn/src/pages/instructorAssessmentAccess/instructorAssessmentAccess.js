import ERR from 'async-stacktrace';
import express from 'express';
import path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

import { syncExamIdAccessRules } from '../../lib/config';
import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');
  var params = {
    assessment_id: res.locals.assessment.id,
    link_exam_id: syncExamIdAccessRules,
  };
  sqldb.query(sql.assessment_access_rules, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.access_rules = result.rows;
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

module.exports = router;
