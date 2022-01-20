const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('../../prairielib/lib/error');
const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

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

router.get('/', function (req, res, next) {
  debug('GET /');
  setFilenames(res.locals);
  async.series(
    [
      function (callback) {
        var params = { assessment_id: res.locals.assessment.id };
        sqldb.queryOneRow(sql.assessment_stats_last_updated, params, function (err, result) {
          if (ERR(err, callback)) return;
          res.locals.stats_last_updated = result.rows[0].stats_last_updated;
          callback(null);
        });
      },
      function (callback) {
        debug('query assessment_stats');
        var params = { assessment_id: res.locals.assessment.id };
        sqldb.queryOneRow(sql.assessment_stats, params, function (err, result) {
          if (ERR(err, callback)) return;
          res.locals.assessment_stat = result.rows[0];
          callback(null);
        });
      },
      function (callback) {
        debug('query questions');
        var params = {
          assessment_id: res.locals.assessment.id,
          course_id: res.locals.course.id,
        };
        sqldb.query(sql.questions, params, function (err, result) {
          if (ERR(err, callback)) return;
          res.locals.questions = result.rows;
          callback(null);
        });
      },
    ],
    function (err) {
      if (ERR(err, next)) return;
      debug('render page');
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  );
});

router.get('/:filename', function (req, res, next) {
  setFilenames(res.locals);
  if (req.params.filename === res.locals.questionStatsCsvFilename) {
    var params = {
      assessment_id: res.locals.assessment.id,
      course_id: res.locals.course.id,
    };
    sqldb.query(sql.questions, params, function (err, result) {
      if (ERR(err, next)) return;
      var questionStatsList = result.rows;
      var csvData = [];
      var csvHeaders = [
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

      csvStringify(csvData, function (err, csv) {
        if (ERR(err, next)) return;
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else {
    next(new Error('Unknown filename: ' + req.params.filename));
  }
});

router.post('/', function (req, res, next) {
  // The action "refresh_stats" (from the button "Recalculate statistics") does
  // not change student data. Statistics *should* be recalculated automatically,
  // e.g., every time this page is loaded, but until then we will let anyone who
  // can view the page post this action and trigger a recalculation.
  if (req.body.__action === 'refresh_stats') {
    var params = [res.locals.assessment.id];
    sqldb.call('assessment_questions_calculate_stats_for_assessment', params, function (err) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
