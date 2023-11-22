// @ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

import { config } from '../../lib/config';
import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
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

export default router;
