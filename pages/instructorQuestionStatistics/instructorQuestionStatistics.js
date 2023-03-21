const asyncHandler = require('express-async-handler');
const express = require('express');
const { pipeline } = require('node:stream/promises');
const { stringifyStream } = require('@prairielearn/csv');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const sanitizeName = require('../../lib/sanitize-name');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const setFilenames = function (locals) {
  const prefix = sanitizeName.questionFilenamePrefix(locals.question, locals.course);
  locals.questionStatsCsvFilename = prefix + 'stats.csv';
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    setFilenames(res.locals);
    const statsResult = await sqldb.queryAsync(sql.assessment_question_stats, {
      question_id: res.locals.question.id,
    });
    res.locals.assessment_stats = statsResult.rows;

    res.locals.question_attempts_histogram = null;
    res.locals.question_attempts_before_giving_up_histogram = null;
    res.locals.question_attempts_histogram_hw = null;
    res.locals.question_attempts_before_giving_up_histogram_hw = null;
    // res.locals.question_attempts_histogram = res.locals.result.question_attempts_histogram;
    // res.locals.question_attempts_before_giving_up_histogram = res.locals.result.question_attempts_before_giving_up_histogram;
    // res.locals.question_attempts_histogram_hw = res.locals.result.question_attempts_histogram_hw;
    // res.locals.question_attempts_before_giving_up_histogram_hw = res.locals.result.question_attempts_before_giving_up_histogram_hw;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    setFilenames(res.locals);

    if (req.params.filename === res.locals.questionStatsCsvFilename) {
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
          ...Object.values(res.locals.stat_descriptions).map((d) => d.non_html_title),
        ],
        transform(row) {
          return [
            row.course_short_name,
            row.course_instance_short_name,
            row.assessment_label,
            row.assessment_question_number,
            row.qid,
            row.question_title,
            row.mean_question_score,
            row.question_score_variance,
            row.discrimination,
            row.some_submission_perc,
            row.some_perfect_submission_perc,
            row.some_nonzero_submission_perc,
            row.average_first_submission_score,
            row.first_submission_score_variance,
            row.first_submission_score_hist,
            row.average_last_submission_score,
            row.last_submission_score_variance,
            row.last_submission_score_hist,
            row.average_max_submission_score,
            row.max_submission_score_variance,
            row.max_submission_score_hist,
            row.average_average_submission_score,
            row.average_submission_score_variance,
            row.average_submission_score_hist,
            row.submission_score_array_averages,
            row.incremental_submission_score_array_averages,
            row.incremental_submission_points_array_averages,
            row.average_number_submissions,
            row.number_submissions_variance,
            row.number_submissions_hist,
            row.quintile_question_scores,
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  })
);

module.exports = router;
