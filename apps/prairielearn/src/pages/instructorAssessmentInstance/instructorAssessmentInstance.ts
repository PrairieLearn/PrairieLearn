import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  type InstanceLogEntry,
  selectAssessmentInstanceLog,
  selectAssessmentInstanceLogCursor,
  setAssessmentInstancePoints,
  setAssessmentInstanceScore,
} from '../../lib/assessment.js';
import * as ltiOutcomes from '../../lib/ltiOutcomes.js';
import { updateInstanceQuestionScore } from '../../lib/manualGrading.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { resetVariantsForInstanceQuestion } from '../../models/variant.js';

import {
  AssessmentInstanceStatsSchema,
  InstanceQuestionRowSchema,
  InstructorAssessmentInstance,
} from './instructorAssessmentInstance.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const DateDurationResultSchema = z.object({
  assessment_instance_date_formatted: z.string(),
  assessment_instance_duration: z.string(),
});

function makeLogCsvFilename(locals: ResLocalsForPage<'assessment-instance'>) {
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
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment-instance'>(async (req, res) => {
    const logCsvFilename = makeLogCsvFilename(res.locals);
    const assessment_instance_stats = await sqldb.queryRows(
      sql.assessment_instance_stats,
      { assessment_instance_id: res.locals.assessment_instance.id },
      AssessmentInstanceStatsSchema,
    );

    const dateDurationResult = await sqldb.queryRow(
      sql.select_date_formatted_duration,
      { assessment_instance_id: res.locals.assessment_instance.id },
      DateDurationResultSchema,
    );
    const assessment_instance_date_formatted =
      dateDurationResult.assessment_instance_date_formatted;
    const assessment_instance_duration = dateDurationResult.assessment_instance_duration;

    const instance_questions = await sqldb.queryRows(
      sql.select_instance_questions,
      { assessment_instance_id: res.locals.assessment_instance.id },
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
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment-instance'>(async (req, res) => {
    if (req.params.filename === makeLogCsvFilename(res.locals)) {
      const cursor = await selectAssessmentInstanceLogCursor(
        res.locals.assessment_instance.id,
        false,
      );
      const fingerprintNumbers = new Map();
      let i = 1;
      const stringifier = stringifyStream<InstanceLogEntry>({
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
      throw new HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  typedAsyncHandler<'assessment-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    // TODO: parse req.body with Zod

    if (req.body.__action === 'edit_total_points') {
      await setAssessmentInstancePoints(
        res.locals.assessment_instance.id,
        req.body.points,
        res.locals.authn_user.id,
      );
      await ltiOutcomes.updateScore(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_total_score_perc') {
      await setAssessmentInstanceScore(
        res.locals.assessment_instance.id,
        req.body.score_perc,
        res.locals.authn_user.id,
      );
      await ltiOutcomes.updateScore(res.locals.assessment_instance.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_question_points') {
      const { modified_at_conflict, grading_job_id } = await updateInstanceQuestionScore({
        assessment: res.locals.assessment,
        instance_question_id: req.body.instance_question_id,
        submission_id: null,
        check_modified_at: req.body.modified_at ? new Date(req.body.modified_at) : null,
        score: {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
          score_perc: req.body.score_perc,
        },
        authn_user_id: res.locals.authn_user.id,
      });
      if (modified_at_conflict) {
        return res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${grading_job_id}`,
        );
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'reset_question_variants') {
      if (res.locals.assessment.type === 'Exam') {
        // See https://github.com/PrairieLearn/PrairieLearn/issues/12977
        throw new HttpStatusError(403, 'Cannot reset variants for Exam assessments');
      }

      await resetVariantsForInstanceQuestion({
        assessment_instance_id: res.locals.assessment_instance.id,
        unsafe_instance_question_id: req.body.unsafe_instance_question_id,
        authn_user_id: res.locals.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
