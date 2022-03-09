const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../../prairielib/lib/error');
const sqlDb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const ltiOutcomes = require('../../lib/ltiOutcomes');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');
  var params = {
    assessment_id: res.locals.assessment.id,
    assessment_question_id: res.locals.assessment_question_id,
  };
  sqlDb.queryOneRow(sql.select_question, params, (err, result) => {
    if (ERR(err, next)) return;

    Object.assign(res.locals, result.rows[0]);

    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.get('/instances.json', function (req, res, next) {
  debug('GET /instances.json');

  var params = {
    assessment_id: res.locals.assessment.id,
    assessment_question_id: res.locals.assessment_question_id,
  };

  sqlDb.query(sql.select_instance_questions_manual_grading, params, function (err, result) {
    if (ERR(err, next)) return;
    result.rows.forEach((row) => {
      // bootstrap-table does not like nulls as filter targets, set to 0 instead
      Object.assign(row, { assigned_grader: row.assigned_grader || 0 });
    });
    res.send({ instance_questions: result.rows });
  });
});

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_instance_permission_edit) return next();
  if (req.body.__action === 'edit_question_points') {
    const params = [
      null, // assessment_id
      req.body.assessment_instance_id,
      null, // submission_id
      req.body.instance_question_id,
      null, // uid
      null, // assessment_instance_number
      null, // qid
      null, // score_perc
      req.body.points,
      null, // feedback
      null, // partial_scores
      res.locals.authn_user.user_id,
    ];
    sqlDb.call('instance_questions_update_score', params, (err, _result) => {
      if (ERR(err, next)) return;
      ltiOutcomes.updateScore(req.body.assessment_instance_id, null, (err) => {
        if (ERR(err, next)) return;
        res.send({});
      });
    });
  } else if (req.body.__action === 'edit_question_score_perc') {
    const params = [
      null, // assessment_id
      req.body.assessment_instance_id,
      null, // submission_id
      req.body.instance_question_id,
      null, // uid
      null, // assessment_instance_number
      null, // qid
      req.body.score_perc,
      null, // points
      null, // feedback
      null, // partial_scores
      res.locals.authn_user.user_id,
    ];
    sqlDb.call('instance_questions_update_score', params, (err, _result) => {
      if (ERR(err, next)) return;
      ltiOutcomes.updateScore(req.body.assessment_instance_id, null, (err) => {
        if (ERR(err, next)) return;
        res.send({});
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
