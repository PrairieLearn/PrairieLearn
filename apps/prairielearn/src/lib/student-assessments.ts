import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { getLocalDate } from '@prairielearn/utils/timezone';
import { IdSchema } from '@prairielearn/zod';

import type { AssessmentAuthzResult } from './assessment-access-control/authz-result.js';
import {
  type AuthzDataForAccessControl,
  resolveModernAssessmentAccessResultsBatch,
  resolverResultToAssessmentAuthzResultForInstance,
} from './assessment-access-control/authz.js';
import { formatLegacyAssessmentAccess } from './assessment-access-control/legacy.js';
import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  type CourseInstance,
  SprocAuthzAssessmentSchema,
} from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export const StudentAssessmentRowBaseSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  multiple_instance_header: z.boolean(),
  assessment_number: AssessmentSchema.shape.number,
  title: AssessmentSchema.shape.title,
  team_work: AssessmentSchema.shape.team_work.nullable(),
  modern_access_control: AssessmentSchema.shape.modern_access_control,
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_color: AssessmentSetSchema.shape.color,
  label: z.string(),
  assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
  assessment_instance_open: AssessmentInstanceSchema.shape.open.nullable(),
  assessment_instance_date_limit: AssessmentInstanceSchema.shape.date_limit.nullable(),
  link: z.string(),
  assessment_group_id: IdSchema,
  assessment_group_heading: z.string(),
});

const StudentAssessmentQueryRowSchema = StudentAssessmentRowBaseSchema.extend({
  raw_authz_result: SprocAuthzAssessmentSchema,
});

export type StudentAssessmentRow = z.infer<typeof StudentAssessmentRowBaseSchema> & {
  authz_result: AssessmentAuthzResult;
};

export type UpcomingStudentAssessment = Omit<StudentAssessmentRow, 'authz_result'> & {
  authz_result: AssessmentAuthzResult & {
    credit_date_string: string;
    credit_end_date: Date;
  };
  status: 'In progress' | 'Not started';
};

export async function selectStudentAssessments({
  courseInstance,
  userId,
  authzData,
  reqDate,
}: {
  courseInstance: CourseInstance;
  userId: string;
  authzData: AuthzDataForAccessControl;
  reqDate: Date;
}): Promise<StudentAssessmentRow[]> {
  const rawRows = await queryRows(
    sql.select_assessments,
    {
      course_instance_id: courseInstance.id,
      authz_data: authzData,
      user_id: userId,
      req_date: reqDate,
      assessments_group_by: courseInstance.assessments_group_by,
    },
    StudentAssessmentQueryRowSchema,
  );

  const hasModern = rawRows.some((row) => row.modern_access_control);
  const modernAccessByAssessment = hasModern
    ? await resolveModernAssessmentAccessResultsBatch({
        courseInstance,
        userId,
        authzData,
        reqDate,
      })
    : null;

  return rawRows
    .map((rawRow): StudentAssessmentRow | null => {
      const { raw_authz_result: rawAuthzResult, ...rowData } = rawRow;
      let authzResult: AssessmentAuthzResult;
      if (rawRow.modern_access_control) {
        const assessmentAccess = modernAccessByAssessment?.get(rawRow.assessment_id);
        if (!assessmentAccess) return null;
        authzResult = resolverResultToAssessmentAuthzResultForInstance({
          result: assessmentAccess,
          authzMode: authzData.mode,
          displayTimezone: courseInstance.display_timezone,
          assessmentInstance:
            rawRow.assessment_instance_id == null
              ? null
              : {
                  open: rawRow.assessment_instance_open,
                  date_limit: rawRow.assessment_instance_date_limit,
                },
          reqDate,
        });
      } else {
        authzResult = formatLegacyAssessmentAccess(
          rawAuthzResult,
          courseInstance.display_timezone,
          reqDate,
        );
      }

      return { ...rowData, authz_result: authzResult };
    })
    .filter((row): row is NonNullable<typeof row> => {
      if (row == null) return false;
      if (row.authz_result.show_before_release) return true;
      return row.authz_result.authorized;
    });
}

export function getUpcomingStudentAssessments(
  rows: StudentAssessmentRow[],
  reqDate: Date,
  displayTimezone: string,
): UpcomingStudentAssessment[] {
  const rowsByAssessment = new Map<string, StudentAssessmentRow[]>();
  for (const row of rows) {
    const assessmentRows = rowsByAssessment.get(row.assessment_id) ?? [];
    assessmentRows.push(row);
    rowsByAssessment.set(row.assessment_id, assessmentRows);
  }
  const candidates = [...rowsByAssessment.values()].flatMap((assessmentRows) => {
    const header = assessmentRows.find((row) => row.multiple_instance_header);
    if (header == null) return assessmentRows;

    const openInstances = assessmentRows.filter(
      (row) => !row.multiple_instance_header && row.assessment_instance_open !== false,
    );
    return openInstances.length > 0 ? openInstances : [header];
  });
  const localToday = getLocalDate(reqDate, displayTimezone);
  const localTomorrow = localToday.add({ days: 1 });

  return candidates.flatMap((row) => {
    const deadline = row.authz_result.credit_end_date;
    if (
      !row.authz_result.authorized ||
      !row.authz_result.active ||
      row.authz_result.credit == null ||
      row.authz_result.credit <= 0 ||
      deadline == null ||
      deadline <= reqDate
    ) {
      return [];
    }

    const localDeadline = getLocalDate(deadline, displayTimezone);
    if (!localDeadline.equals(localToday) && !localDeadline.equals(localTomorrow)) return [];

    return [
      {
        ...row,
        authz_result: {
          ...row.authz_result,
          credit_date_string: row.authz_result.credit_date_string ?? `${row.authz_result.credit}%`,
          credit_end_date: deadline,
        },
        status: row.assessment_instance_id == null ? 'Not started' : 'In progress',
      },
    ];
  });
}
