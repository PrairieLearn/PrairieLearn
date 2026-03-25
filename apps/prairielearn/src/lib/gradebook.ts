import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  type AuthzDataForAccessControl,
  resolveModernAssessmentAccessBatch,
} from './assessment-access-control/authz.js';
import { type CourseInstance } from './db-types.js';
import {
  type StaffGradebookRow,
  StaffGradebookRowSchema,
  type StudentGradebookRow,
  StudentGradebookRowSchema,
} from './gradebook.shared.js';

const sql = loadSqlEquiv(import.meta.url);

interface GetGradebookRowsParams {
  courseInstance: CourseInstance;
  userId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
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
    courseInstance: params.courseInstance,
    userId: params.userId,
    authzData: params.authzData,
    reqDate: params.reqDate,
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
  courseInstance,
  userId,
  authzData,
  reqDate,
  auth,
}: GetGradebookRowsParams): Promise<StudentGradebookRow[] | StaffGradebookRow[]> {
  const queryParams = {
    course_instance_id: courseInstance.id,
    user_id: userId,
    authz_data: authzData,
    req_date: reqDate,
  };

  if (auth === 'student') {
    const rows = await queryRows(
      sql.select_assessment_instances,
      queryParams,
      StudentGradebookRowSchema,
    );
    await applyModernAccessControl(rows, {
      courseInstance,
      userId,
      authzData,
      reqDate,
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
    courseInstance,
    userId,
    authzData,
    reqDate,
    auth,
  });
  return rows;
}

export { getGradebookRows };
