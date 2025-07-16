/* eslint no-restricted-imports: ["error", {"patterns": ["db-types.js"] }] */

import {
  type CursorIterator,
  loadSqlEquiv,
  queryRows,
  queryValidatedCursor,
} from '@prairielearn/postgres';

import {
  type StaffGradebookRow,
  StaffGradebookRowSchema,
  type StudentGradebookRow,
  StudentGradebookRowSchema,
} from './gradebook.shared.js';

const sql = loadSqlEquiv(import.meta.url);

interface getGradebookRowsParams {
  course_instance_id: string;
  user_id: string;
  authz_data: any;
  req_date: any;
  auth: 'student' | 'instructor';
}

async function getGradebookRows(
  params: getGradebookRowsParams & { auth: 'student' },
): Promise<StudentGradebookRow[]>;

async function getGradebookRows(
  params: getGradebookRowsParams & { auth: 'instructor' },
): Promise<StaffGradebookRow[]>;

async function getGradebookRows({
  course_instance_id,
  user_id,
  authz_data,
  req_date,
  auth,
}: getGradebookRowsParams): Promise<StudentGradebookRow[] | StaffGradebookRow[]> {
  if (auth === 'student') {
    return await queryRows(
      sql.select_assessment_instances,
      {
        course_instance_id,
        user_id,
        authz_data,
        req_date,
      },
      StudentGradebookRowSchema,
    );
  }

  return await queryRows(
    sql.select_assessment_instances,
    {
      course_instance_id,
      user_id,
      authz_data,
      req_date,
    },
    StaffGradebookRowSchema,
  );
}

async function getGradebookRowsCursor(
  params: getGradebookRowsParams & { auth: 'student' },
): Promise<CursorIterator<StudentGradebookRow>>;

async function getGradebookRowsCursor(
  params: getGradebookRowsParams & { auth: 'instructor' },
): Promise<CursorIterator<StaffGradebookRow>>;

async function getGradebookRowsCursor({
  course_instance_id,
  user_id,
  authz_data,
  req_date,
  auth,
}: getGradebookRowsParams): Promise<
  CursorIterator<StudentGradebookRow> | CursorIterator<StaffGradebookRow>
> {
  if (auth === 'student') {
    return await queryValidatedCursor(
      sql.select_assessment_instances,
      {
        course_instance_id,
        user_id,
        authz_data,
        req_date,
      },
      StudentGradebookRowSchema,
    );
  }
  return await queryValidatedCursor(
    sql.select_assessment_instances,
    {
      course_instance_id,
      user_id,
      authz_data,
      req_date,
    },
    StaffGradebookRowSchema,
  );
}

export { getGradebookRows, getGradebookRowsCursor };
