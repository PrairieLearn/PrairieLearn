import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { questionFilenamePrefix } from '../../lib/sanitize-name.js';
import { STAT_DESCRIPTIONS } from '../shared/assessmentStatDescriptions.js';

import {
  AssessmentQuestionStatsRowSchema,
  InstructorQuestionStatistics,
} from './instructorQuestionStatistics.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

function makeStatsCsvFilename(locals) {
  const prefix = questionFilenamePrefix(locals.question, locals.course);
  return prefix + 'stats.csv';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: Support question statistics for shared questions. For now, forbid
    // access to question statistics if question is shared from another course.
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    const rows = await sqldb.queryRows(
      sql.assessment_question_stats,
      {
        question_id: res.locals.question.id,
      },
      AssessmentQuestionStatsRowSchema,
    );

    res.send(
      InstructorQuestionStatistics({
        questionStatsCsvFilename: makeStatsCsvFilename(res.locals),
        rows,
        resLocals: res.locals,
      }),
    );
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    // TODO: Support question statistics for shared questions. For now, forbid
    // access to question statistics if question is shared from another course.
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }

    if (req.params.filename === makeStatsCsvFilename(res.locals)) {
      const cursor = await sqldb.queryCursor(sql.assessment_question_stats, {
        question_id: res.locals.question.id,
      });

      const stringifier = stringifyStream({
        header: true,
        columns: [
          'Course',
          'Instance',
          'Assessment',
          'Question number',
          'QID',
          'Question title',
          ...Object.values(STAT_DESCRIPTIONS).map((d) => d.non_html_title),
        ],
        transform(record) {
          return [
            record.course_short_name,
            record.course_instance_short_name,
            record.assessment_label,
            record.assessment_question_number,
            record.qid,
            record.question_title,
            record.mean_question_score,
            record.median_question_score,
            record.question_score_variance,
            record.discrimination,
            record.some_submission_perc,
            record.some_perfect_submission_perc,
            record.some_nonzero_submission_perc,
            record.average_first_submission_score,
            record.first_submission_score_variance,
            record.first_submission_score_hist,
            record.average_last_submission_score,
            record.last_submission_score_variance,
            record.last_submission_score_hist,
            record.average_max_submission_score,
            record.max_submission_score_variance,
            record.max_submission_score_hist,
            record.average_average_submission_score,
            record.average_submission_score_variance,
            record.average_submission_score_hist,
            record.submission_score_array_averages,
            record.incremental_submission_score_array_averages,
            record.incremental_submission_points_array_averages,
            record.average_number_submissions,
            record.number_submissions_variance,
            record.number_submissions_hist,
            record.quintile_question_scores,
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw new error.HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

export default router;
