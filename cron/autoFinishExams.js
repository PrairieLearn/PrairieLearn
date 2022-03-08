var ERR = require('async-stacktrace');
var async = require('async');

var config = require('../lib/config');
var logger = require('../lib/logger');
var assessment = require('../lib/assessment');
var sqldb = require('../prairielib/lib/sql-db');

module.exports = {};

module.exports.run = function (callback) {
  var params = [config.autoFinishAgeMins];
  sqldb.call('assessment_instances_select_for_auto_close', params, function (err, result) {
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
        // Close them exam before grading it.
        const closeExam = true;
        // Override any submission or grading rate limites.
        const overrideGradeRate = true;
        assessment.gradeAssessmentInstance(
          examItem.assessment_instance_id,
          authn_user_id,
          requireOpen,
          closeExam,
          overrideGradeRate,
          function (err) {
            if (ERR(err, () => {})) {
              logger.error('Error finishing exam', { examItem, err });
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
