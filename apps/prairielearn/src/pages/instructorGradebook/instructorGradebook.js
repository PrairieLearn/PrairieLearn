// @ts-check
import asyncHandler from 'express-async-handler';
import _ from 'lodash';
import * as express from 'express';
import { stringifyStream } from '@prairielearn/csv';
import { pipeline } from 'node:stream/promises';
import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  getCourseOwners,
  checkAssessmentInstanceBelongsToCourseInstance,
} from '../../lib/course.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import { updateAssessmentInstanceScore } from '../../lib/assessment.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const csvFilename = function (locals) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.csvFilename = csvFilename(res.locals);

    if (!res.locals.authz_data.has_course_instance_permission_view) {
      // We don't actually forbid access to this page if the user is not a student
      // data viewer, because we want to allow users to click the gradebook tab and
      // see instructions for how to get student data viewer permissions. Otherwise,
      // users just wouldn't see the tab at all, and this caused a lot of questions
      // about why staff couldn't see the gradebook tab.
      res.locals.course_owners = await getCourseOwners(res.locals.course.id);
      res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
      return;
    }

    const result = await sqldb.queryAsync(sql.course_assessments, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.locals.course_assessments = result.rows;
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/raw_data.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const result = await sqldb.queryAsync(sql.user_scores, {
      course_id: res.locals.course.id,
      course_instance_id: res.locals.course_instance.id,
    });

    res.locals.user_scores_data = _.map(result.rows, function (row) {
      const scores = {
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
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    if (req.params.filename === csvFilename(res.locals)) {
      const assessmentsResult = await sqldb.queryAsync(sql.course_assessments, {
        course_id: res.locals.course.id,
        course_instance_id: res.locals.course_instance.id,
      });
      const userScoresCursor = await sqldb.queryCursor(sql.user_scores, {
        course_id: res.locals.course.id,
        course_instance_id: res.locals.course_instance.id,
      });

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
      throw new HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'edit_total_score_perc') {
      await checkAssessmentInstanceBelongsToCourseInstance(
        req.body.assessment_instance_id,
        res.locals.course_instance.id,
      );
      await updateAssessmentInstanceScore(
        req.body.assessment_instance_id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      );

      const result = await sqldb.queryAsync(sql.assessment_instance_score, {
        assessment_instance_id: req.body.assessment_instance_id,
      });
      res.send(JSON.stringify(result.rows));
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
