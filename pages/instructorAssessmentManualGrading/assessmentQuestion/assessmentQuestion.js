const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const util = require('util');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../../../prairielib/lib/error');
const sqlDb = require('../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');

const ltiOutcomes = require('../../../lib/ltiOutcomes');
const manualGrading = require('../../../lib/manualGrading');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    debug('GET /');
    var params = {
      assessment_id: res.locals.assessment.id,
      assessment_question_id: res.locals.assessment_question_id,
    };
    const result = await sqlDb.queryZeroOrOneRowAsync(sql.select_assessment_question_data, params);
    if (result.rowCount == 0) {
      return next(error.make(403, 'Access denied', null));
    }
    Object.assign(res.locals, result.rows[0]);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.get(
  '/instances.json',
  asyncHandler(async (req, res, _next) => {
    debug('GET /instances.json');

    var params = {
      assessment_id: res.locals.assessment.id,
      assessment_question_id: res.locals.assessment_question_id,
    };

    const result = await sqlDb.queryAsync(sql.select_instance_questions_manual_grading, params);
    result.rows.forEach((row) => {
      // bootstrap-table does not like nulls as filter targets, set to 0 instead
      Object.assign(row, { assigned_grader: row.assigned_grader || 0 });
    });
    res.send({ instance_questions: result.rows });
  })
);

router.get(
  '/next_ungraded',
  asyncHandler(async (req, res, _next) => {
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question_id,
        res.locals.authz_data.user.user_id,
        null
      )
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) return next();
    if (req.body.__action === 'batch_action') {
      const action_data = JSON.parse(req.body.batch_action_data) || {};
      const instance_question_ids = Array.isArray(req.body.instance_question_id)
        ? req.body.instance_question_id
        : [req.body.instance_question_id];
      const params = {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question_id,
        instance_question_ids,
        update_requires_manual_grading: 'requires_manual_grading' in action_data,
        requires_manual_grading: !!action_data?.requires_manual_grading,
        update_assigned_grader: 'assigned_grader' in action_data,
        assigned_grader: action_data?.assigned_grader,
      };
      await sqlDb.queryAsync(sql.update_instance_questions, params);
      res.send({});
    } else if (req.body.__action === 'edit_question_points') {
      const params = [
        res.locals.assessment_id,
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
      await sqlDb.callAsync('instance_questions_update_score', params);
      await util.promisify(ltiOutcomes.updateScore)(req.body.assessment_instance_id);
      res.send({});
    } else if (req.body.__action === 'edit_question_score_perc') {
      const params = [
        res.locals.assessment_id,
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
      await sqlDb.callAsync('instance_questions_update_score', params);
      await util.promisify(ltiOutcomes.updateScore)(req.body.assessment_instance_id);
      res.send({});
    } else {
      return next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        })
      );
    }
  })
);

module.exports = router;
