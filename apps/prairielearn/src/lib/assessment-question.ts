import * as sqldb from '@prairielearn/postgres';

import {
  type StaffAssessmentQuestionRow,
  StaffAssessmentQuestionRowSchema,
  StaffAssessmentQuestionSqlSchema,
} from './assessment-question.shared.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectAssessmentQuestions({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<StaffAssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    StaffAssessmentQuestionSqlSchema,
  );

  const groupCounts: Record<string, number> = {};
  for (const row of rows) {
    const groupId = row.alternative_group.id;
    groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
  }
  let prevZoneId: string | null = null;
  let prevAltGroupId: string | null = null;

  const result: StaffAssessmentQuestionRow[] = [];
  for (const row of rows) {
    const start_new_zone = row.zone.id !== prevZoneId;
    const start_new_alternative_group = row.alternative_group.id !== prevAltGroupId;
    const alternative_group_size = groupCounts[row.alternative_group.id];
    result.push(
      StaffAssessmentQuestionRowSchema.parse({
        ...row,
        start_new_zone,
        start_new_alternative_group,
        alternative_group_size,
      }),
    );
    prevZoneId = row.zone.id;
    prevAltGroupId = row.alternative_group.id;
  }
  return result;
}
