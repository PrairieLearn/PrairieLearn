import { z } from 'zod';

import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});
export type AssessmentStatsRow = z.infer<typeof AssessmentStatsRowSchema>;

export const AssessmentRowSchema = AssessmentStatsRowSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
  open_issue_count: z.coerce.number(),
});
export type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export interface StatsUpdateData {
  assessmentIdsNeedingStatsUpdate: string[];
  urlPrefix: string;
}
