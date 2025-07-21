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

interface GetGradebookRowsParams {
  course_instance_id: string;
  user_id: string;
  authz_data: any;
  req_date: any;
  auth: 'student' | 'instructor';
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
  auth,
}: GetGradebookRowsParams): Promise<StudentGradebookRow[] | StaffGradebookRow[]> {
  return await queryRows(
    sql.select_assessment_instances,
    {
      course_instance_id,
      user_id,
      authz_data,
      req_date,
    },
    auth === 'student' ? StudentGradebookRowSchema : StaffGradebookRowSchema,
  );
}

async function getGradebookRowsCursor(
  params: GetGradebookRowsParams & { auth: 'student' },
): Promise<CursorIterator<StudentGradebookRow>>;

async function getGradebookRowsCursor(
  params: GetGradebookRowsParams & { auth: 'instructor' },
): Promise<CursorIterator<StaffGradebookRow>>;

async function getGradebookRowsCursor({
  course_instance_id,
  user_id,
  authz_data,
  req_date,
  auth,
}: GetGradebookRowsParams): Promise<
  CursorIterator<StudentGradebookRow> | CursorIterator<StaffGradebookRow>
> {
  return await queryValidatedCursor(
    sql.select_assessment_instances,
    {
      course_instance_id,
      user_id,
      authz_data,
      req_date,
    },
    auth === 'student' ? StudentGradebookRowSchema : StaffGradebookRowSchema,
  );
}

export { getGradebookRows, getGradebookRowsCursor };
