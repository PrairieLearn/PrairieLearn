import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type AssessmentModule, AssessmentModuleSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export const AssessmentForModuleSchema = z.object({
  assessment_id: IdSchema,
  tid: z.string(),
  title: z.string(),
  label: z.string(),
  color: z.string(),
  course_instance_id: IdSchema,
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
});
export type AssessmentForModule = z.infer<typeof AssessmentForModuleSchema>;

export const AssessmentModuleWithAssessmentsSchema = AssessmentModuleSchema.extend({
  assessments: z.array(AssessmentForModuleSchema),
});
export type AssessmentModuleWithAssessments = z.infer<typeof AssessmentModuleWithAssessmentsSchema>;

export async function selectAssessmentModulesForCourse(
  course_id: string,
): Promise<AssessmentModule[]> {
  return await queryRows(
    sql.select_assessment_modules_for_course,
    { course_id },
    AssessmentModuleSchema,
  );
}

export async function selectAssessmentModulesWithAssessmentsForCourse(
  course_id: string,
): Promise<AssessmentModuleWithAssessments[]> {
  return await queryRows(
    sql.select_assessment_modules_with_assessments_for_course,
    { course_id },
    AssessmentModuleWithAssessmentsSchema,
  );
}
