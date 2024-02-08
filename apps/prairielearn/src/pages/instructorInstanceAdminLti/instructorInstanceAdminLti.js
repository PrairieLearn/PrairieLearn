//@ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
import * as express from 'express';

import { getCourseOwners } from '../../lib/course';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    getCourseOwners(res.locals.course.id)
      .then((owners) => {
        res.locals.course_owners = owners;
        res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => next(err));
    return;
  }
  var params = {
    course_instance_id: res.locals.course_instance.id,
  };

  sqldb.query(sql.lti_data, params, function (err, result) {
    if (ERR(err, next)) return;
    _.assign(res.locals, result.rows[0]);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be a course Editor)'));
  }
  var params;
  if (req.body.__action === 'lti_new_cred') {
    params = {
      key: 'K' + randomString(),
      secret: 'S' + randomString(),
      course_instance_id: res.locals.course_instance.id,
    };
    sqldb.query(sql.insert_cred, params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'lti_del_cred') {
    params = {
      id: req.body.lti_link_id,
      ci_id: res.locals.course_instance.id,
    };
    sqldb.query(sql.delete_cred, params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'lti_link_target') {
    var newAssessment = null;
    if (req.body.newAssessment !== '') {
      newAssessment = req.body.newAssessment;
    }

    params = {
      assessment_id: newAssessment,
      id: req.body.lti_link_id,
      ci_id: res.locals.course_instance.id,
    };
    sqldb.query(sql.update_link, params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

export default router;

function randomString() {
  var len = 10;
  return (
    Math.random().toString(36).substring(2, len) + Math.random().toString(36).substring(2, len)
  );
}
