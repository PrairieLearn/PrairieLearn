const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const util = require('node:util');

const error = require('@prairielearn/error');
const regrading = require('../../lib/regrading');
const assessment = require('../../lib/assessment');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/raw_data.json', function (req, res, next) {
  debug('GET /raw_data.json');
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  const params = {
    assessment_id: res.locals.assessment.id,
    group_work: res.locals.assessment.group_work,
  };
  sqldb.query(sql.select_assessment_instances, params, function (err, result) {
    if (ERR(err, next)) return;
    res.send(result.rows);
    return;
  });
});

router.get('/client.js', function (req, res, next) {
  debug('GET /client.js');
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  res.type('text/javascript');
  res.render(__filename.replace(/\.js$/, 'ClientJS.ejs'), res.locals);
});

router.get('/', function (req, res, next) {
  debug('GET /');
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  debug('render page');
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_edit) {
    return next(error.make(403, 'Access denied (must be a student data editor)'));
  }

  if (req.body.__action === 'close') {
    const assessment_id = res.locals.assessment.id;
    const assessment_instance_id = req.body.assessment_instance_id;
    assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
      if (ERR(err, next)) return;

      const requireOpen = true;
      const close = true;
      const overrideGradeRate = true;
      assessment.gradeAssessmentInstance(
        assessment_instance_id,
        res.locals.authn_user.user_id,
        requireOpen,
        close,
        overrideGradeRate,
        function (err) {
          if (ERR(err, next)) return;
          res.send(JSON.stringify({}));
        },
      );
    });
  } else if (req.body.__action === 'delete') {
    const assessment_id = res.locals.assessment.id;
    const assessment_instance_id = req.body.assessment_instance_id;
    assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
      if (ERR(err, next)) return;

      const params = [assessment_instance_id, res.locals.authn_user.user_id];
      sqldb.call('assessment_instances_delete', params, function (err) {
        if (ERR(err, next)) return;
        res.send(JSON.stringify({}));
      });
    });
  } else if (req.body.__action === 'grade_all' || req.body.__action === 'close_all') {
    const assessment_id = res.locals.assessment.id;
    const close = req.body.__action === 'close_all';
    const overrideGradeRate = true;
    util.callbackify(assessment.gradeAllAssessmentInstances)(
      assessment_id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      close,
      overrideGradeRate,
      function (err, job_sequence_id) {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
      },
    );
  } else if (req.body.__action === 'delete_all') {
    const params = [res.locals.assessment.id, res.locals.authn_user.user_id];
    sqldb.call('assessment_instances_delete_all', params, function (err) {
      if (ERR(err, next)) return;
      res.send(JSON.stringify({}));
    });
  } else if (req.body.__action === 'regrade') {
    const assessment_id = res.locals.assessment.id;
    const assessment_instance_id = req.body.assessment_instance_id;
    assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
      if (ERR(err, next)) return;

      regrading.regradeAssessmentInstance(
        assessment_instance_id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        function (err, job_sequence_id) {
          if (ERR(err, next)) return;
          res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        },
      );
    });
  } else if (req.body.__action === 'set_time_limit') {
    const params = {
      assessment_instance_id: req.body.assessment_instance_id,
      assessment_id: res.locals.assessment.id,
      time_add: req.body.time_add,
      time_ref: req.body.time_ref,
      base_time: 'date_limit',
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    };
    if (req.body.plus_minus === 'unlimited') {
      params.base_time = 'null';
    } else if (req.body.plus_minus === 'expire') {
      params.base_time = 'current_date';
      params.time_add = 0;
      params.time_ref = 'minutes';
    } else if (req.body.plus_minus === 'set_total') {
      params.base_time = 'start_date';
    } else if (req.body.plus_minus === 'set_rem') {
      params.base_time = 'current_date';
    } else {
      params.time_add *= req.body.plus_minus;
    }
    sqldb.query(sql.set_time_limit, params, function (err) {
      if (ERR(err, next)) return;
      res.send(JSON.stringify({}));
    });
  } else if (req.body.__action === 'set_time_limit_all') {
    const params = {
      assessment_id: res.locals.assessment.id,
      time_add: req.body.time_add,
      time_ref: req.body.time_ref,
      base_time: 'date_limit',
      reopen_closed: !!req.body.reopen_closed,
      authn_user_id: res.locals.authz_data.authn_user.user_id,
    };
    if (req.body.plus_minus === 'unlimited') {
      params.base_time = 'null';
    } else if (req.body.plus_minus === 'expire') {
      params.base_time = 'current_date';
      params.time_add = 0;
      params.time_ref = 'minutes';
    } else if (req.body.plus_minus === 'set_total') {
      params.base_time = 'start_date';
    } else if (req.body.plus_minus === 'set_rem') {
      params.base_time = 'current_date';
    } else {
      params.time_add *= req.body.plus_minus;
    }
    sqldb.query(sql.set_time_limit_all, params, function (err) {
      if (ERR(err, next)) return;
      res.send(JSON.stringify({}));
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});
module.exports = router;
