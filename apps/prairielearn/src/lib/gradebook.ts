/* eslint no-restricted-imports: ["error", {"patterns": ["db-types.js"] }] */

import { z } from 'zod';

import {
  type CursorIterator,
  loadSqlEquiv,
  queryRows,
  queryValidatedCursor,
} from '@prairielearn/postgres';

import {
  StaffAssessmentInstanceSchema,
  StaffAssessmentSchema,
  StaffAssessmentSetSchema,
  StaffCourseInstanceSchema,
  StudentAssessmentInstanceSchema,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  StudentCourseInstanceSchema,
} from './client/safe-db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const StudentGradebookRowSchema = z
  .object({
    assessment: StudentAssessmentSchema,
    assessment_instance: StudentAssessmentInstanceSchema,
    assessment_set: StudentAssessmentSetSchema,
    course_instance: StudentCourseInstanceSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .brand('StudentGradebookRow');

const StaffGradebookRowSchema = z
  .object({
    assessment: StaffAssessmentSchema,
    assessment_instance: StaffAssessmentInstanceSchema,
    assessment_set: StaffAssessmentSetSchema,
    course_instance: StaffCourseInstanceSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .brand('StaffGradebookRow');

type StudentGradebookRow = z.infer<typeof StudentGradebookRowSchema>;
type StaffGradebookRow = z.infer<typeof StaffGradebookRowSchema>;

interface getGradebookRowsParams {
  course_instance_id: string;
  user_id: string;
  authz_data: any;
  req_date: any;
  auth: 'student' | 'staff';
}

async function getGradebookRows(
  params: getGradebookRowsParams & { auth: 'student' },
): Promise<StudentGradebookRow[]>;

async function getGradebookRows(
  params: getGradebookRowsParams & { auth: 'staff' },
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
  params: getGradebookRowsParams & { auth: 'staff' },
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
  const sql = loadSqlEquiv(import.meta.url);
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

function computeTitle({ assessment, assessment_instance }: StudentGradebookRow) {
  if (assessment.multiple_instance) {
    return `${assessment.title} instance #${assessment_instance.number}`;
  }
  return assessment.title ?? '';
}

function computeLabel({ assessment, assessment_instance, assessment_set }: StudentGradebookRow) {
  if (assessment.multiple_instance) {
    return `${assessment_set.abbreviation}${assessment.number}#${assessment_instance.number}`;
  }
  return `${assessment_set.abbreviation}${assessment.number}`;
}

export {
  getGradebookRows,
  getGradebookRowsCursor,
  computeTitle,
  computeLabel,
  StudentGradebookRowSchema,
  StaffGradebookRowSchema,
  type StudentGradebookRow,
  type StaffGradebookRow,
};
