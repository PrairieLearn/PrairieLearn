import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { AssessmentUsageSchema } from '../components/AssessmentUsageModal.js';
import { type AssessmentModule, AssessmentModuleSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export const AssessmentModuleWithAssessmentsSchema = AssessmentModuleSchema.extend({
  assessments: z.array(AssessmentUsageSchema),
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
