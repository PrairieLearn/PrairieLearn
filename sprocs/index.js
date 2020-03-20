const ERR = require('async-stacktrace');
const fs = require('fs');
const path = require('path');
const async = require('async');

const namedLocks = require('../lib/named-locks');
const error = require('@prairielearn/prairielib/error');
const logger = require('../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {
    init(callback) {
        const lockName = 'sprocs';
        logger.verbose(`Waiting for lock ${lockName}`);
        namedLocks.waitLock(lockName, {}, (err, lock) => {
            if (ERR(err, callback)) return;
            logger.verbose(`Acquired lock ${lockName}`);
            this._initWithLock((err) => {
                namedLocks.releaseLock(lock, (lockErr) => {
                    if (ERR(lockErr, callback)) return;
                    if (ERR(err, callback)) return;
                    logger.verbose(`Released lock ${lockName}`);
                    callback(null);
                });
            });
        });
    },

    _initWithLock(callback) {
        logger.verbose('Starting DB stored procedure initialization');
        async.eachSeries([
            'array_dot.sql',
            'array_product.sql',
            'array_increments_above_max.sql',
            'array_and_number.sql',
            'array_avg.sql',
            'array_var.sql',
            'base64_safe_decode.sql',
            'histogram.sql',
            'array_histogram.sql',
            'format_interval.sql',
            'format_interval_short.sql',
            'format_date_iso8601.sql',
            'format_date_short.sql',
            'format_date_full.sql',
            'format_date_full_compact.sql',
            'format_date_full_compact_ms.sql',
            'format_date_only_no_tz.sql',
            'input_date.sql',
            'interval_hist_thresholds.sql',
            'jsonb_array_to_text_array.sql',
            'jsonb_array_to_double_precision_array.sql',
            'check_course_instance_access_rule.sql',
            'check_course_instance_access.sql',
            'check_assessment_access_rule.sql',
            'check_assessment_access.sql',
            'assessment_instances_lock.sql',
            'assessment_instances_insert.sql',
            'assessment_instances_duration.sql',
            'assessment_instances_update_points.sql',
            'assessment_instances_update_score_perc.sql',
            'assessments_duration_stats.sql',
            'assessments_stats.sql',
            'assessments_format.sql',
            'assessments_format_for_question.sql',
            'tags_for_question.sql',
            'random_unique.sql',
            'question_order.sql',
            'authz_assessment.sql',
            'authz_assessment_instance.sql',
            'select_assessment_questions.sql',
            'questions_select.sql',
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
            'courses_user_can_edit.sql',
            'course_instances_instructor_can_view.sql',
            'select_or_insert_course_by_path.sql',
            'assessment_instances_delete.sql',
            'assessment_instances_delete_all.sql',
            'assessment_instances_grade.sql',
            'assessment_instances_regrade.sql',
            'assessment_instances_select_for_auto_close.sql',
            'assessment_instances_ensure_open.sql',
            'instance_questions_points_homework.sql',
            'instance_questions_points_exam.sql',
            'instance_questions_points.sql',
            'instance_questions_grade.sql',
            'instance_questions_select_question.sql',
            'instance_questions_lock.sql',
            'instance_questions_ensure_open.sql',
            'instance_questions_select_variant.sql',
            'instance_questions_update_score.sql',
            'submissions_lock.sql',
            'submissions_select.sql',
            'submissions_insert.sql',
            'submissions_update_parsing.sql',
            'assessment_instances_update.sql',
            'instance_questions_update_in_grading.sql',
            'assessment_instances_close.sql',
            'grading_job_status.sql',
            'grading_jobs_lock.sql',
            'grading_jobs_insert.sql',
            'grading_jobs_insert_external_manual.sql',
            'grading_jobs_insert_internal.sql',
            'grading_jobs_process_external.sql',
            'ip_to_mode.sql',
            'config_select.sql',
            'users_select_or_insert.sql',
            'users_select_or_insert_lti.sql',
            'users_is_course_staff.sql',
            'dump_to_csv.sql',
            'grading_jobs_stats_day.sql',
            'files_insert.sql',
            'files_delete.sql',
            'issues_insert_for_variant.sql',
            'issues_insert_for_assessment.sql',
            'issues_update_open.sql',
            'issues_update_open_all.sql',
            'variants_lock.sql',
            'variants_select.sql',
            'variants_ensure_instance_question.sql',
            'variants_ensure_question.sql',
            'variants_insert.sql',
            'variants_select_submission_for_grading.sql',
            'variants_select_for_assessment_instance_grading.sql',
            'variants_update_after_grading.sql',
            'variants_ensure_open.sql',
            'variants_unlink.sql',
            'grader_loads_current.sql',
            'server_loads_current.sql',
            'server_usage_current.sql',
            'assessment_questions_calculate_stats_for_assessment.sql',
            'assessment_questions_calculate_stats.sql',
            'instance_questions_calculate_stats.sql',
            'issues_select_with_filter.sql',
            'access_tokens_insert.sql',
            'access_tokens_delete.sql',
            'assessment_instances_points.sql',
            'sync_news_items.sql',
            'sync_course_tags.sql',
            'sync_question_tags.sql',
            'sync_questions.sql',
            'sync_assessments.sql',
            'sync_course_staff.sql',
            'sync_assessment_sets.sql',
            'sync_topics.sql',
            'sync_course_instances.sql',
            'lock_timeout_set.sql',
        ], function(filename, callback) {
            logger.verbose('Loading ' + filename);
            fs.readFile(path.join(__dirname, filename), 'utf8', function(err, sql) {
                if (ERR(err, callback)) return;
                sqldb.query(sql, [], function(err, _result) {
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
