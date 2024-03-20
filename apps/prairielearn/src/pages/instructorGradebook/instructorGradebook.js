// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
import * as express from 'express';
import { stringifyStream } from '@prairielearn/csv';
import { pipeline } from 'node:stream/promises';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { callbackify } from 'node:util';

import { getCourseOwners, checkBelongs } from '../../lib/course';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name';
import { updateAssessmentInstanceScore } from '../../lib/assessment';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const csvFilename = function (locals) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
};

router.get('/', function (req, res, next) {
  res.locals.csvFilename = csvFilename(res.locals);

  if (!res.locals.authz_data.has_course_instance_permission_view) {
    // We don't actually forbid access to this page if the user is not a student
    // data viewer, because we want to allow users to click the gradebook tab and
    // see instructions for how to get student data viewer permissions. Otherwise,
    // users just wouldn't see the tab at all, and this caused a lot of questions
    // about why staff couldn't see the gradebook tab.
    getCourseOwners(res.locals.course.id)
      .then((owners) => {
        res.locals.course_owners = owners;
        res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => next(err));
    return;
  }

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

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }

    if (req.params.filename === csvFilename(res.locals)) {
      const params = {
        course_id: res.locals.course.id,
        course_instance_id: res.locals.course_instance.id,
      };

      const assessmentsResult = await sqldb.queryAsync(sql.course_assessments, params);
      const userScoresCursor = await sqldb.queryCursor(sql.user_scores, params);

      const stringifier = stringifyStream({
        header: true,
        columns: ['UID', 'UIN', 'Name', 'Role', ...assessmentsResult.rows.map((a) => a.label)],
        transform(record) {
          const score_percs = _.map(record.scores, (s) => s.score_perc);
          return [record.uid, record.uin, record.user_name, record.role].concat(score_percs);
        },
      });

      res.attachment(req.params.filename);
      await pipeline(userScoresCursor.stream(100), stringifier, res);
    } else {
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_edit) {
    return next(error.make(403, 'Access denied (must be a student data editor)'));
  }

  if (req.body.__action === 'edit_total_score_perc') {
    const course_instance_id = res.locals.course_instance.id;
    const assessment_instance_id = req.body.assessment_instance_id;
    checkBelongs(assessment_instance_id, course_instance_id, (err) => {
      if (ERR(err, next)) return;

      callbackify(updateAssessmentInstanceScore)(
        req.body.assessment_instance_id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
        function (err) {
          if (ERR(err, next)) return;

          let queryParams = {
            assessment_instance_id: req.body.assessment_instance_id,
          };

          sqldb.query(sql.assessment_instance_score, queryParams, function (err, result) {
            if (ERR(err, next)) return;
            res.send(JSON.stringify(result.rows));
          });
        },
      );
    });
  } else {
    return next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

export default router;
