var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('../../lib/nonblocking-csv-stringify');
var express = require('express');
var router = express.Router();

var error = require('../../prairielib/lib/error');
const sanitizeName = require('../../lib/sanitize-name');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var course = require('../../lib/course');

var sql = sqlLoader.loadSqlEquiv(__filename);

var csvFilename = function (locals) {
  return (
    sanitizeName.courseInstanceFilenamePrefix(locals.course_instance, locals.course) +
    'gradebook.csv'
  );
};

router.get('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  res.locals.csvFilename = csvFilename(res.locals);
  var params = { course_instance_id: res.locals.course_instance.id };
  sqldb.query(sql.course_assessments, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.course_assessments = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.get('/raw_data.json', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  var params = {
    course_id: res.locals.course.id,
    course_instance_id: res.locals.course_instance.id,
  };
  sqldb.query(sql.user_scores, params, function (err, result) {
    if (ERR(err, next)) return;

    res.locals.user_scores_data = _.map(result.rows, function (row) {
      var scores = {
        user_id: row.user_id,
        uid: _.escape(row.uid),
        uin: _.escape(row.uin ?? ''),
        user_name: _.escape(row.user_name ?? ''),
        role: row.role,
      };
      row.scores.forEach(function (score) {
        scores[`score_${score.assessment_id}`] = score.score_perc;
        scores[`score_${score.assessment_id}_ai_id`] = score.assessment_instance_id;
        scores[`score_${score.assessment_id}_other`] = _.map(score.uid_other_users_group, _.escape);
      });
      return scores;
    });
    res.send(JSON.stringify(res.locals.user_scores_data));
  });
});

router.get('/:filename', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }

  if (req.params.filename === csvFilename(res.locals)) {
    var params = {
      course_id: res.locals.course.id,
      course_instance_id: res.locals.course_instance.id,
    };
    sqldb.query(sql.course_assessments, params, function (err, result) {
      if (ERR(err, next)) return;
      var courseAssessments = result.rows;
      sqldb.query(sql.user_scores, params, function (err, result) {
        if (ERR(err, next)) return;
        var userScores = result.rows;

        var csvHeaders = ['UID', 'UIN', 'Name', 'Role'].concat(_.map(courseAssessments, 'label'));
        var csvData = _.map(userScores, function (row) {
          const score_percs = _.map(row.scores, (s) => s.score_perc);
          return [row.uid, row.uin, row.user_name, row.role].concat(score_percs);
        });
        csvData.splice(0, 0, csvHeaders);
        csvStringify(csvData, function (err, csv) {
          if (ERR(err, next)) return;
          res.attachment(req.params.filename);
          res.send(csv);
        });
      });
    });
  } else {
    next(new Error('Unknown filename: ' + req.params.filename));
  }
});

router.post('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_edit) {
    return next(error.make(403, 'Access denied (must be a student data editor)'));
  }

  if (req.body.__action === 'edit_total_score_perc') {
    const course_instance_id = res.locals.course_instance.id;
    const assessment_instance_id = req.body.assessment_instance_id;
    course.checkBelongs(assessment_instance_id, course_instance_id, (err) => {
      if (ERR(err, next)) return;

      let params = [
        req.body.assessment_instance_id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      ];
      sqldb.call('assessment_instances_update_score_perc', params, function (err, _result) {
        if (ERR(err, next)) return;

        params = {
          assessment_instance_id: req.body.assessment_instance_id,
        };

        sqldb.query(sql.assessment_instance_score, params, function (err, result) {
          if (ERR(err, next)) return;
          res.send(JSON.stringify(result.rows));
        });
      });
    });
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
