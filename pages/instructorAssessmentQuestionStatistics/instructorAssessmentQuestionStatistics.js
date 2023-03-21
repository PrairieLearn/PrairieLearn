const asyncHandler = require('express-async-handler');
const express = require('express');
const { pipeline } = require('node:stream/promises');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const { stringifyStream } = require('@prairielearn/csv');

const sanitizeName = require('../../lib/sanitize-name');
const assessment = require('../../lib/assessment');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const setFilenames = function (locals) {
  const prefix = sanitizeName.assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course
  );
  locals.questionStatsCsvFilename = prefix + 'question_stats.csv';
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    setFilenames(res.locals);

    // make sure statistics are up to date
    await assessment.updateAssessmentStatistics(res.locals.assessment.id);

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
  })
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // The action "refresh_stats" (from the button "Recalculate statistics") does
    // not change student data. Statistics *should* be recalculated automatically,
    // e.g., every time this page is loaded, but until then we will let anyone who
    // can view the page post this action and trigger a recalculation.
    if (req.body.__action === 'refresh_stats') {
      await sqldb.callAsync('assessment_questions_calculate_stats_for_assessment', [
        res.locals.assessment.id,
      ]);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  })
);

module.exports = router;
