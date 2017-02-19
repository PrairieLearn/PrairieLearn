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
            'format_date_iso8601.sql',
            'format_date_short.sql',
            'format_date_full.sql',
            'format_date_full_compact.sql',
            'input_date.sql',
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
            'assessment_points.sql',
            'random_unique.sql',
            'question_order.sql',
            'exam_question_status.sql',
            'auth_instructor_course_instance.sql',
            'auth_instructor_assessment_instance.sql',
            'authz_assessment.sql',
            'authz_assessment_instance.sql',
            'select_assessment_questions.sql',
            'course_instances_with_uuid_elsewhere.sql',
            'questions_with_uuid_elsewhere.sql',
            'assessments_with_uuid_elsewhere.sql',
            'assessment_instance_label.sql',
            'assessment_label.sql',
            'admin_assessment_question_number.sql',
            'course_permissions_insert_by_user_uid.sql',
            'course_permissions_update_role.sql',
            'course_permissions_delete.sql',
            'authz_course.sql',
            'authz_course_instance.sql',
            'administrators_insert_by_user_uid.sql',
            'administrators_delete_by_user_id.sql',
            'courses_insert.sql',
            'courses_update_column.sql',
            'courses_delete.sql',
            'select_or_insert_course_by_path.sql',
            'assessment_instances_delete.sql',
            'assessment_instances_delete_all.sql',
            'assessment_instances_score.sql',
            'assessment_instances_regrade.sql',
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
