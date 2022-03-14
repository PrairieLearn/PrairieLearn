// @ts-check
var ERR = require('async-stacktrace');
var async = require('async');

var error = require('../prairielib/lib/error');
var config = require('../lib/config');
var logger = require('../lib/logger');
var assessment = require('../lib/assessment');
var sqldb = require('../prairielib/lib/sql-db');

/**
 * This cron job runs periodically to check for any exams that need to be
 * "finished". This includes exams that are still open and are configured to
 * auto-close after a certain time period, and exams that were previously
 * closed but not completely graded.
 *
 * @see assessment.gradeAssessmentInstance
 *
 * @param {(err?: Error) => void} callback
 */
module.exports.run = function (callback) {
  var params = [config.autoFinishAgeMins];
  sqldb.call('assessment_instances_select_for_auto_finish', params, function (err, result) {
    if (ERR(err, callback)) return;
    var examList = result.rows;

    async.eachSeries(
      examList,
      function (examItem, callback) {
        logger.verbose('autoFinishExams: finishing ' + examItem.assessment_instance_id, examItem);
        // Grading was performed by the syste.
        const authn_user_id = null;
        // Don't require the assessment to be open. This is important to
        // ensure we correctly handle the case where the PrairieLearn process
        // dies in the middle of grading a question. In that case, the assessment
        // would have already been closed, but we still need to grade it.
        const requireOpen = false;
        // Override any submission or grading rate limits.
        const overrideGradeRate = true;
        assessment.gradeAssessmentInstance(
          examItem.assessment_instance_id,
          authn_user_id,
          requireOpen,
          examItem.close_assessment,
          overrideGradeRate,
          function (err) {
            if (ERR(err, () => {})) {
              logger.error('Error finishing exam', error.addData(err, { examItem }));
            }
            callback(null);
          }
        );
      },
      function (err) {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  });
};
