import { readFile } from 'fs/promises';
import { join } from 'path';
import { eachSeries } from 'async';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { queryAsync } from '@prairielearn/postgres';

export async function init() {
  logger.verbose('Starting DB stored procedure initialization');
  await eachSeries(
    [
      'scores_to_points_array.sql',
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
      'assessments_duration_stats.sql',
      'assessments_score_stats.sql',
      'assessments_format.sql',
      'assessments_format_for_question.sql',
      'tags_for_question.sql',
      'random_unique.sql',
      'question_order.sql',
      'authz_assessment.sql',
      'authz_assessment_instance.sql',
      'select_assessment_questions.sql',
      'assessment_instance_label.sql',
      'assessment_label.sql',
      'admin_assessment_question_number.sql',
      'authz_course.sql',
      'authz_course_instance.sql',
      'administrators_insert_by_user_uid.sql',
      'administrators_delete_by_user_id.sql',
      'courses_insert.sql',
      'courses_update_column.sql',
      'courses_delete.sql',
      'course_instances_select_graders.sql',
      'assessment_instances_grade.sql',
      'assessment_instances_regrade.sql',
      'instance_questions_points_homework.sql',
      'instance_questions_points_exam.sql',
      'instance_questions_points.sql',
      'instance_questions_grade.sql',
      'instance_questions_next_allowed_grade.sql',
      'submissions_lock.sql',
      'assessment_instances_update.sql',
      'grading_job_status.sql',
      'grading_jobs_lock.sql',
      'grading_jobs_insert.sql',
      'grading_jobs_update_after_grading.sql',
      'ip_to_mode.sql',
      'users_select_or_insert.sql',
      'users_select_or_insert_and_enroll_lti.sql',
      'users_are_instructors_in_any_course.sql',
      'users_is_instructor_in_any_course.sql',
      'users_is_instructor_in_course.sql',
      'users_is_instructor_in_course_instance.sql',
      'users_get_displayed_role.sql',
      'users_randomly_generate.sql',
      'grading_jobs_stats_day.sql',
      'issues_insert_for_variant.sql',
      'variants_lock.sql',
      'variants_update_after_grading.sql',
      'grader_loads_current.sql',
      'server_loads_current.sql',
      'server_usage_current.sql',
      'instance_questions_calculate_stats.sql',
      'assessment_instances_points.sql',
      'sync_course_instances.sql',
      'sync_topics.sql',
      'sync_questions.sql',
      'sync_news_items.sql',
      'sync_course_tags.sql',
      'sync_question_tags.sql',
      'sync_assessment_sets.sql',
      'sync_assessments.sql',
      'group_info.sql',
      'groups_uid_list.sql',
      'workspace_loads_current.sql',
      'sync_assessment_modules.sql',
    ],
    async (filename) => {
      logger.verbose('Loading ' + filename);
      try {
        const sql = await readFile(join(__dirname, filename), 'utf8');
        await queryAsync(sql, []);
      } catch (err) {
        throw error.addData(err, { sqlFile: filename });
      }
    },
  );
  logger.verbose('Successfully completed DB stored procedure initialization');
}
