// @ts-check
import * as express from 'express';
import { pipeline } from 'node:stream/promises';
const asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { stringifyStream } from '@prairielearn/csv';

import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name';
import * as ltiOutcomes from '../../lib/ltiOutcomes';
import { updateInstanceQuestionScore } from '../../lib/manualGrading';
import {
  selectAssessmentInstanceLog,
  selectAssessmentInstanceLogCursor,
} from '../../lib/assessment';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const logCsvFilename = (locals) => {
  return (
    assessmentFilenamePrefix(
      locals.assessment,
      locals.assessment_set,
      locals.course_instance,
      locals.course,
    ) +
    sanitizeString(locals.instance_group?.name ?? locals.instance_user?.uid ?? 'unknown') +
    '_' +
    locals.assessment_instance.number +
    '_' +
    'log.csv'
  );
};

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    res.locals.assessment_instance_stats = (
      await sqldb.queryAsync(sql.assessment_instance_stats, {
        assessment_instance_id: res.locals.assessment_instance.id,
      })
    ).rows;

    const dateDurationResult = await sqldb.queryOneRowAsync(sql.select_date_formatted_duration, {
      assessment_instance_id: res.locals.assessment_instance.id,
    });
    res.locals.assessment_instance_date_formatted =
      dateDurationResult.rows[0].assessment_instance_date_formatted;
    res.locals.assessment_instance_duration =
      dateDurationResult.rows[0].assessment_instance_duration;

    res.locals.instance_questions = (
      await sqldb.queryAsync(sql.select_instance_questions, {
        assessment_instance_id: res.locals.assessment_instance.id,
      })
    ).rows;

    res.locals.log = await selectAssessmentInstanceLog(res.locals.assessment_instance.id, false);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    if (req.params.filename === logCsvFilename(res.locals)) {
      const cursor = await selectAssessmentInstanceLogCursor(
        res.locals.assessment_instance.id,
        false,
      );
      const fingerprintNumbers = {};
      let i = 1;
      const stringifier = stringifyStream({
        header: true,
        columns: [
          'Time',
          'Auth user',
          'Fingerprint',
          'IP Address',
          'Event',
          'Instructor question',
          'Student question',
          'Data',
        ],
        transform(record) {
          if (record.client_fingerprint) {
            if (!fingerprintNumbers[record.client_fingerprint.id]) {
              fingerprintNumbers[record.client_fingerprint.id] = i;
              i++;
            }
            record.client_fingerprint_number = fingerprintNumbers[record.client_fingerprint.id];
          }
          return [
            record.date_iso8601,
            record.auth_user_uid,
            record.client_fingerprint_number == null ? null : record.client_fingerprint_number,
            record.client_fingerprint?.ip_address == null
              ? null
              : record.client_fingerprint.ip_address,
            record.event_name,
            record.instructor_question_number == null
              ? null
              : 'I-' + record.instructor_question_number + ' (' + record.qid + ')',
            record.student_question_number == null
              ? null
              : 'S-' +
                record.student_question_number +
                (record.variant_number == null ? '' : '#' + record.variant_number),
            record.data == null ? null : JSON.stringify(record.data),
            // record.client_fingerprint_number == null ? null : record.client_fingerprint_number,
            // record.client_fingerprint.ip_address == null
            //   ? null
            //   : record.client_fingerprint.ip_address,
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      next(error.make(404, 'Unknown filename: ' + req.params.filename));
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'edit_total_points') {
      await sqldb.callAsync('assessment_instances_update_points', [
        res.locals.assessment_instance.id,
        req.body.points,
        res.locals.authn_user.user_id,
      ]);
      await ltiOutcomes.updateScoreAsync(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_total_score_perc') {
      await sqldb.callAsync('assessment_instances_update_score_perc', [
        res.locals.assessment_instance.id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      ]);
      await ltiOutcomes.updateScoreAsync(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_question_points') {
      const { modified_at_conflict, grading_job_id } = await updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at,
        {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
        },
        res.locals.authn_user.user_id,
      );
      if (modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${grading_job_id}`,
        );
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_question_score_perc') {
      const { modified_at_conflict, grading_job_id } = await updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at,
        { score_perc: req.body.score_perc },
        res.locals.authn_user.user_id,
      );
      if (modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${grading_job_id}`,
        );
      }
      res.redirect(req.originalUrl);
    } else {
      return next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        }),
      );
    }
  }),
);

export default router;
