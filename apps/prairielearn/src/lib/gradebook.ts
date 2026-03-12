/* eslint no-restricted-imports: ["error", {"patterns": ["db-types.js"] }] */

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { resolveModernAssessmentAccessBatch } from './access-control-modern.js';
import {
  type StaffGradebookRow,
  StaffGradebookRowSchema,
  type StudentGradebookRow,
  StudentGradebookRowSchema,
} from './gradebook.shared.js';

const sql = loadSqlEquiv(import.meta.url);

interface GetGradebookRowsParams {
  course_instance_id: string;
  user_id: string;
  authz_data: any;
  req_date: any;
  display_timezone: string;
  auth: 'student' | 'instructor';
}

async function applyModernAccessControl<
  T extends {
    modern_access_control: boolean;
    assessment_id: string;
    show_closed_assessment_score: boolean;
    assessment_instance: { points: number | null; score_perc: number | null };
  },
>(rows: T[], params: GetGradebookRowsParams): Promise<void> {
  const hasModern = rows.some((r) => r.modern_access_control);
  if (!hasModern) return;

  const modernResults = await resolveModernAssessmentAccessBatch({
    courseInstanceId: params.course_instance_id,
    userId: params.user_id,
    authzData: params.authz_data,
    reqDate: params.req_date,
    displayTimezone: params.display_timezone,
  });

  for (const row of rows) {
    if (!row.modern_access_control) continue;
    const result = modernResults.get(row.assessment_id);
    if (result) {
      row.show_closed_assessment_score = result.show_closed_assessment_score;
      if (params.auth === 'student' && !result.show_closed_assessment_score) {
        row.assessment_instance.points = null;
        row.assessment_instance.score_perc = null;
      }
    }
  }
}

async function getGradebookRows(
  params: GetGradebookRowsParams & { auth: 'student' },
): Promise<StudentGradebookRow[]>;

async function getGradebookRows(
  params: GetGradebookRowsParams & { auth: 'instructor' },
): Promise<StaffGradebookRow[]>;

async function getGradebookRows({
  course_instance_id,
  user_id,
  authz_data,
  req_date,
  display_timezone,
  auth,
}: GetGradebookRowsParams): Promise<StudentGradebookRow[] | StaffGradebookRow[]> {
  const queryParams = { course_instance_id, user_id, authz_data, req_date };

  if (auth === 'student') {
    const rows = await queryRows(
      sql.select_assessment_instances,
      queryParams,
      StudentGradebookRowSchema,
    );
    await applyModernAccessControl(rows, {
      course_instance_id,
      user_id,
      authz_data,
      req_date,
      display_timezone,
      auth,
    });
    return rows;
  }

  const rows = await queryRows(
    sql.select_assessment_instances,
    queryParams,
    StaffGradebookRowSchema,
  );
  await applyModernAccessControl(rows, {
    course_instance_id,
    user_id,
    authz_data,
    req_date,
    display_timezone,
    auth,
  });
  return rows;
}

export { getGradebookRows };
