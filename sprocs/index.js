var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pg = require('pg');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');

module.exports = {
    init: function(callback) {
        logger.verbose('Starting DB stored procedure initialization');
        async.eachSeries([
            'histogram.sql',
            'array_histogram.sql',
            'format_interval.sql',
            'format_interval_short.sql',
            'format_date_full_compact.sql',
            'interval_hist_thresholds.sql',
            'check_course_instance_access_rule.sql',
            'check_course_instance_access.sql',
            'check_assessment_access_rule.sql',
            'check_assessment_access.sql',
            'assessment_instance_durations.sql',
            'user_assessment_durations.sql',
            'assessment_duration_stats.sql',
            'user_assessment_scores.sql',
            'student_assessment_scores.sql',
            'assessment_stats.sql',
            'assessments_for_question.sql',
            'tags_for_question.sql',
            'assessment_points_homework.sql',
            'assessment_points_exam.sql',
            'random_unique.sql',
            'question_order.sql',
            'exam_question_status.sql',
            'auth_instructor_course_instance.sql',
            'auth_instructor_assessment_instance.sql',
            'all_courses.sql',
            'all_course_instances.sql',
            'all_instances_for_course.sql',
            'authz_assessment.sql',
            'authz_assessment_instance.sql',
            'select_assessment_questions.sql',
            'set_question_uuid.sql',
            'set_assessment_uuid.sql',
            'set_course_instance_uuid.sql',
            'course_instances_with_uuid_elsewhere.sql',
            'questions_with_uuid_elsewhere.sql',
            'assessments_with_uuid_elsewhere.sql',
        ], function(filename, callback) {
            logger.verbose('Loading ' + filename);
            fs.readFile(path.join(__dirname, filename), 'utf8', function(err, sql) {
                if (ERR(err, callback)) return;
                sqldb.query(sql, [], function(err) {
                    if (err) error.addData(err, {sqlFile: filename});
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            logger.verbose('Successfully completed DB stored procedure initialization');
            callback(null);
        });
    },
};
