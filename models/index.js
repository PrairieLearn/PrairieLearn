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
        logger.verbose('Starting DB model initialization');
        async.eachSeries([
            // tracking migrations
            'migrations.sql',

            // types
            'enum_mode.sql',
            'enum_question_type.sql',
            'enum_role.sql',
            'enum_course_role.sql',
            'enum_submission_type.sql',
            'enum_assessment_type.sql',
            'enum_auth_action.sql',
            'enum_grading_method.sql',
            'enum_job_status.sql',
            'enum_instance_question_status.sql',

            // top-level tables
            'config.sql',
            'users.sql',
            'administrators.sql',
            'pl_courses.sql',
            'course_permissions.sql',
            'exam_mode_networks.sql',

            // PrairieSchedule proxy tables
            'courses.sql',
            'exams.sql',
            'reservations.sql',

            // tables synced from git repo
            'course_instances.sql',
            'course_instance_access_rules.sql',
            'topics.sql',
            'questions.sql',
            'tags.sql',
            'question_tags.sql',
            'assessment_sets.sql',
            'assessments.sql',
            'zones.sql',
            'alternative_groups.sql',
            'assessment_access_rules.sql',
            'assessment_questions.sql',

            // tables created during operation
            'enrollments.sql',
            'assessment_instances.sql',
            'instance_questions.sql',
            'variants.sql',
            'submissions.sql',
            'job_sequences.sql',
            'jobs.sql',
            'last_accesses.sql',

            // tables for logging
            'assessment_state_logs.sql',
            'assessment_score_logs.sql',
            'access_logs.sql',
            'variant_view_logs.sql',
            'grading_logs.sql',
            'question_score_logs.sql',
            'audit_logs.sql',
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
            logger.verbose('Successfully completed DB model initialization');
            callback(null);
        });
    },
};
