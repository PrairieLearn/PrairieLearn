//@ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  var params = {
    course_instance_id: res.locals.course_instance.id,
  };

  sqldb.query(sql.course_instance_access_rules, params, function (err, result) {
    if (ERR(err, next)) return;

    res.locals.access_rules = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

export default router;
