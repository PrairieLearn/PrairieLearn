// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import { pipeline } from 'node:stream/promises';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { stringifyStream } from '@prairielearn/csv';

import { assessmentFilenamePrefix } from '../../lib/sanitize-name';
import {
  updateAssessmentQuestionStatsForAssessment,
  updateAssessmentStatistics,
} from '../../lib/assessment';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const setFilenames = function (locals) {
  const prefix = assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course,
  );
  locals.questionStatsCsvFilename = prefix + 'question_stats.csv';
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    setFilenames(res.locals);

    // make sure statistics are up to date
    await updateAssessmentStatistics(res.locals.assessment.id);

    // re-fetch assessment to get updated statistics
    const assessmentResult = await sqldb.queryOneRowAsync(sql.select_assessment, {
      assessment_id: res.locals.assessment.id,
    });
    res.locals.assessment = assessmentResult.rows[0].assessment;

    // Fetch assessments.stats_last_updated (the time when we last updated
    // the _question_ statistics for this assessment). Note that this is
    // different to assessments.statistics_last_updated_at (the time we last
    // updated the assessment instance statistics stored in the assessments
    // row itself).
    const lastUpdateResult = await sqldb.queryOneRowAsync(sql.assessment_stats_last_updated, {
      assessment_id: res.locals.assessment.id,
    });
    res.locals.stats_last_updated = lastUpdateResult.rows[0].stats_last_updated;

    const questionResult = await sqldb.queryAsync(sql.questions, {
      assessment_id: res.locals.assessment.id,
      course_id: res.locals.course.id,
    });
    res.locals.questions = questionResult.rows;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    setFilenames(res.locals);
    if (req.params.filename === res.locals.questionStatsCsvFilename) {
      const cursor = await sqldb.queryCursor(sql.questions, {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
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
          ...Object.values(res.locals.stat_descriptions).map((d) => d.non_html_title),
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
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // The action "refresh_stats" (from the button "Recalculate statistics") does
    // not change student data. Statistics *should* be recalculated automatically,
    // e.g., every time this page is loaded, but until then we will let anyone who
    // can view the page post this action and trigger a recalculation.
    if (req.body.__action === 'refresh_stats') {
      await updateAssessmentQuestionStatsForAssessment(res.locals.assessment.id);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
