const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const fs = require('fs-extra');
const async = require('async');
const ERR = require('async-stacktrace');
const logger = require('../../lib/logger');
const error = require('../../prairielib/lib/error');
const { InstructorSharing } = require('./instructorCourseAdminSharing.html')
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');

  sqldb.queryOneRow(sql.get_course_sharing_info, { course_id: res.locals.course.id }, (err, result) => {
    if (ERR(err, next)) return;
    let sharing_name = result.rows[0].sharing_name;
    let sharing_id = result.rows[0].sharing_id;

    sqldb.query(sql.select_sharing_sets, { course_id: res.locals.course.id }, (err, result) => {
      if (ERR(err, next)) return;

      res.send(InstructorSharing({
        sharing_name: sharing_name,
        sharing_id: sharing_id,
        sharing_sets: result.rows,
        resLocals: res.locals
      }));
    });
  });
});

router.post('/', (req, res, next) => {
  console.log('COURSE ADMIN SHARING: POST')
  if (!res.locals.authz_data.has_course_permission_own) {
    return next(error.make(403, 'Access denied (must be course owner)'));
  }



  if (req.body.__action === 'sharing_id_regenerate') {
    console.log('regenerate!!!');

  } else if (req.body.__action === '') {

  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
