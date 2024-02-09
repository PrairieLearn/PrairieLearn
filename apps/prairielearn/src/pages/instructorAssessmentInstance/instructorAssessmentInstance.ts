import * as express from 'express';
import { pipeline } from 'node:stream/promises';
import asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { stringifyStream } from '@prairielearn/csv';
import { z } from 'zod';

import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name';
import * as ltiOutcomes from '../../lib/ltiOutcomes';
import { updateInstanceQuestionScore } from '../../lib/manualGrading';
import {
  selectAssessmentInstanceLog,
  selectAssessmentInstanceLogCursor,
  updateAssessmentInstancePoints,
  updateAssessmentInstanceScore,
} from '../../lib/assessment';
import { resetVariantsForInstanceQuestion } from '../../models/variant';
import {
  InstructorAssessmentInstance,
  AssessmentInstanceStatsSchema,
  InstanceQuestionRowSchema,
} from './instructorAssessmentInstance.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const DateDurationResultSchema = z.object({
  assessment_instance_date_formatted: z.string(),
  assessment_instance_duration: z.string(),
});

function makeLogCsvFilename(locals) {
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
}

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    const logCsvFilename = makeLogCsvFilename(res.locals);
    const assessment_instance_stats = await sqldb.queryRows(
      sql.assessment_instance_stats,
      {
        assessment_instance_id: res.locals.assessment_instance.id,
      },
      AssessmentInstanceStatsSchema,
    );

    const dateDurationResult = await sqldb.queryRow(
      sql.select_date_formatted_duration,
      {
        assessment_instance_id: res.locals.assessment_instance.id,
      },
      DateDurationResultSchema,
    );
    const assessment_instance_date_formatted =
      dateDurationResult.assessment_instance_date_formatted;
    const assessment_instance_duration = dateDurationResult.assessment_instance_duration;

    const instance_questions = await sqldb.queryRows(
      sql.select_instance_questions,
      {
        assessment_instance_id: res.locals.assessment_instance.id,
      },
      InstanceQuestionRowSchema,
    );

    const assessmentInstanceLog = await selectAssessmentInstanceLog(
      res.locals.assessment_instance.id,
      false,
    );

    res.send(
      InstructorAssessmentInstance({
        resLocals: res.locals,
        logCsvFilename,
        assessment_instance_stats,
        assessment_instance_date_formatted,
        assessment_instance_duration,
        instance_questions,
        assessmentInstanceLog,
      }),
    );
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    if (req.params.filename === makeLogCsvFilename(res.locals)) {
      const cursor = await selectAssessmentInstanceLogCursor(
        res.locals.assessment_instance.id,
        false,
      );
      const fingerprintNumbers = new Map();
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
            if (!fingerprintNumbers.get(record.client_fingerprint.id)) {
              fingerprintNumbers.set(record.client_fingerprint.id, i);
              i++;
            }
          }
          return [
            record.date_iso8601,
            record.auth_user_uid,
            fingerprintNumbers.get(record.client_fingerprint?.id) ?? null,
            record.client_fingerprint?.ip_address ?? null,
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
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'edit_total_points') {
      await updateAssessmentInstancePoints(
        res.locals.assessment_instance.id,
        req.body.points,
        res.locals.authn_user.user_id,
      );
      await ltiOutcomes.updateScoreAsync(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_total_score_perc') {
      await updateAssessmentInstanceScore(
        res.locals.assessment_instance.id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      );
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
    } else if (req.body.__action === 'reset_question_variants') {
      await resetVariantsForInstanceQuestion({
        assessment_instance_id: res.locals.assessment_instance.id,
        unsafe_instance_question_id: req.body.unsafe_instance_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
