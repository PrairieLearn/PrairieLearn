const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { v4: uuidv4 } = require('uuid');
const ERR = require('async-stacktrace');
const error = require('../../prairielib/lib/error');
const { InstructorSharing } = require('./instructorCourseAdminSharing.html');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');

  sqldb.queryOneRow(
    sql.get_course_sharing_info,
    { course_id: res.locals.course.id },
    (err, result) => {
      if (ERR(err, next)) return;
      let sharing_name = result.rows[0].sharing_name;
      let sharing_id = result.rows[0].sharing_id;

      sqldb.query(sql.select_sharing_sets, { course_id: res.locals.course.id }, (err, result) => {
        if (ERR(err, next)) return;

        res.send(
          InstructorSharing({
            sharing_name: sharing_name,
            sharing_id: sharing_id,
            sharing_sets: result.rows,
            resLocals: res.locals,
          })
        );
      });
    }
  );
});

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_own) {
    return next(error.make(403, 'Access denied (must be course owner)'));
  }

  if (req.body.__action === 'sharing_id_regenerate') {
    let newSharingId = uuidv4();
    sqldb.queryZeroOrOneRow(
      sql.update_sharing_id,
      { sharing_id: newSharingId, course_id: res.locals.course.id },
      (err, _result) => {
        if (ERR(err, next)) return;

        res.redirect(req.originalUrl);
      }
    );
  } else if (req.body.__action === 'sharing_set_create') {
    // TODO: disallow duplicates!
    sqldb.queryZeroOrOneRow(
      sql.create_sharing_set,
      { sharing_set_name: req.body.sharing_set_name, course_id: res.locals.course.id },
      (err, _result) => {
        if (ERR(err, next)) return;

        res.redirect(req.originalUrl);
      }
    );
  } else if (req.body.__action === 'course_sharing_set_add') {
    sqldb.queryZeroOrOneRow(
      sql.course_sharing_set_add,
      { sharing_set_id: req.body.sharing_set_id, course_sharing_id: req.body.course_sharing_id },
      (err, _result) => {
        if (ERR(err, next)) return;

        res.redirect(req.originalUrl);
      }
    );
  } else if (req.body.__action === 'course_sharing_set_delete') {
    // TODO: do we actually want to allow deleting the sharing with a course?
    // In the future we want to do some fancy versioning stuff. How do we transition from allowing deletion
    // to versioning questions?
  } else if (req.body.__action === 'choose_sharing_name') {
    sqldb.queryZeroOrOneRow(
      sql.choose_sharing_name,
      { sharing_name: req.body.course_sharing_name, course_id: res.locals.course.id },
      (err, _result) => {
        if (ERR(err, next)) return;

        res.redirect(req.originalUrl);
      }
    );
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
