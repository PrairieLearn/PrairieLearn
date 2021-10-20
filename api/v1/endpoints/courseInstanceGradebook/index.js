const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router({
  mergeParams: true,
});

const sqldb = require('../../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  const params = {
    course_instance_id: res.locals.course_instance.id,
  };
  sqldb.queryOneRow(sql.select_user_scores, params, (err, result) => {
    if (ERR(err, next)) return;
    res.status(200).send(result.rows[0].item);
  });
});

module.exports = router;
