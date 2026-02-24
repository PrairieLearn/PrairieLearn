import { readFile } from 'fs/promises';
import { join } from 'path';

import { eachSeries } from 'async';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { execute } from '@prairielearn/postgres';

export async function init() {
  logger.verbose('Starting DB stored procedure initialization');
  await eachSeries(
    [
      'array_and_number.sql',
      'array_avg.sql',
      'array_var.sql',
      'histogram.sql',
      'array_histogram.sql',
      'format_interval.sql',
      'format_date_iso8601.sql',
      'format_date_short.sql',
      'format_date_full.sql',
      'format_date_full_compact.sql',
      'input_date.sql',
      'interval_hist_thresholds.sql',
      'jsonb_array_to_text_array.sql',
      'jsonb_array_to_double_precision_array.sql',
      'check_course_instance_access_rule.sql',
      'check_course_instance_access.sql',
      'check_assessment_access_rule.sql',
      'check_assessment_access.sql',
      'random_unique.sql',
      'question_order.sql',
      'authz_assessment.sql',
      'authz_assessment_instance.sql',
      'admin_assessment_question_number.sql',
      'authz_course.sql',
      'authz_course_instance.sql',
      'courses_update_column.sql',
      'ip_to_mode.sql',
      'users_select_or_insert.sql',
      'users_select_or_insert_lti.sql',
      'users_is_instructor_in_course_instance.sql',
      'users_get_displayed_role.sql',
      'grading_jobs_stats_day.sql',
      'grader_loads_current.sql',
      'server_loads_current.sql',
      'server_usage_current.sql',
      'sync_course_instances.sql',
      'sync_questions.sql',
      'sync_assessments.sql',
      'team_info.sql',
      'teams_uid_list.sql',
      'workspace_loads_current.sql',
    ],
    async (filename) => {
      logger.verbose('Loading ' + filename);
      try {
        const sql = await readFile(join(import.meta.dirname, filename), 'utf8');
        await execute(sql);
      } catch (err) {
        throw error.addData(err, { sqlFile: filename });
      }
    },
  );
  logger.verbose('Successfully completed DB stored procedure initialization');
}
