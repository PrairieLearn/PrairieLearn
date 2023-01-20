const _ = require('lodash');
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const { nonblockingStringifyAsync } = require('../../lib/nonblocking-csv-stringify');

const error = require('../../prairielib/lib/error');
const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const assessment = require('../../lib/assessment');

const sql = sqlLoader.loadSqlEquiv(__filename);

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
      const questionStatsList = (
        await sqldb.queryAsync(sql.questions, {
          assessment_id: res.locals.assessment.id,
          course_id: res.locals.course.id,
        })
      ).rows;
      const csvData = [];
      const csvHeaders = [
        'Course',
        'Instance',
        'Assessment',
        'Question number',
        'QID',
        'Question title',
      ];
      Object.keys(res.locals.stat_descriptions).forEach((key) => {
        csvHeaders.push(res.locals.stat_descriptions[key].non_html_title);
      });

      csvData.push(csvHeaders);

      _(questionStatsList).each(function (questionStats) {
        var questionStatsData = [];
        questionStatsData.push(questionStats.course_short_name);
        questionStatsData.push(questionStats.course_instance_short_name);
        questionStatsData.push(questionStats.assessment_label);
        questionStatsData.push(questionStats.assessment_question_number);
        questionStatsData.push(questionStats.qid);
        questionStatsData.push(questionStats.question_title);
        questionStatsData.push(questionStats.mean_question_score);
        questionStatsData.push(questionStats.question_score_variance);
        questionStatsData.push(questionStats.discrimination);
        questionStatsData.push(questionStats.some_submission_perc);
        questionStatsData.push(questionStats.some_perfect_submission_perc);
        questionStatsData.push(questionStats.some_nonzero_submission_perc);
        questionStatsData.push(questionStats.average_first_submission_score);
        questionStatsData.push(questionStats.first_submission_score_variance);
        questionStatsData.push(questionStats.first_submission_score_hist);
        questionStatsData.push(questionStats.average_last_submission_score);
        questionStatsData.push(questionStats.last_submission_score_variance);
        questionStatsData.push(questionStats.last_submission_score_hist);
        questionStatsData.push(questionStats.average_max_submission_score);
        questionStatsData.push(questionStats.max_submission_score_variance);
        questionStatsData.push(questionStats.max_submission_score_hist);
        questionStatsData.push(questionStats.average_average_submission_score);
        questionStatsData.push(questionStats.average_submission_score_variance);
        questionStatsData.push(questionStats.average_submission_score_hist);
        questionStatsData.push(questionStats.submission_score_array_averages);
        questionStatsData.push(questionStats.incremental_submission_score_array_averages);
        questionStatsData.push(questionStats.incremental_submission_points_array_averages);
        questionStatsData.push(questionStats.average_number_submissions);
        questionStatsData.push(questionStats.number_submissions_variance);
        questionStatsData.push(questionStats.number_submissions_hist);
        questionStatsData.push(questionStats.quintile_question_scores);

        _(questionStats.quintile_scores).each(function (perc) {
          questionStatsData.push(perc);
        });

        csvData.push(questionStatsData);
      });
      const csv = await nonblockingStringifyAsync(csvData);

      res.attachment(req.params.filename);
      res.send(csv);
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
