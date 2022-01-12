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
        const authn_user_id = null; // graded by the system
        const closeExam = true; // close the exam after grading it
        const overrideGradeRate = true; // override submission/grading limits
        assessment.gradeAssessmentInstance(
          examItem.assessment_instance_id,
          authn_user_id,
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
