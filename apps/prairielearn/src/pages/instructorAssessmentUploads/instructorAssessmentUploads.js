// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
import * as express from 'express';
const debug = require('debug')('prairielearn:instructorAssessment');
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  uploadInstanceQuestionScores,
  uploadAssessmentInstanceScores,
} from '../../lib/score-upload';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET /');
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  var params = {
    assessment_id: res.locals.assessment.id,
  };
  sqldb.query(sql.select_upload_job_sequences, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.upload_job_sequences = result.rows;
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_instance_question_scores') {
      const jobSequenceId = await uploadInstanceQuestionScores(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'upload_assessment_instance_scores') {
      const jobSequenceId = await uploadAssessmentInstanceScores(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
