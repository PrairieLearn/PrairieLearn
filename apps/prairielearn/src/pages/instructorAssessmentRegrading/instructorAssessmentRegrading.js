// @ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const asyncHandler = require('express-async-handler');

import * as error from '@prairielearn/error';
import { regradeAllAssessmentInstances } from '../../lib/regrading';
import * as sqldb from '@prairielearn/postgres';

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
  sqldb.query(sql.select_regrading_job_sequences, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.regrading_job_sequences = result.rows;
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

    if (req.body.__action === 'regrade_all') {
      const job_sequence_id = await regradeAllAssessmentInstances(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
