import { z } from 'zod';

import {
  AccessTimelineEntrySchema,
  AssessmentAccessRuleSchema,
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocAuthzAssessmentSchema,
} from '../../lib/db-types.js';

export const StudentAssessmentsRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  multiple_instance_header: z.boolean(),
  assessment_number: AssessmentSchema.shape.number,
  title: AssessmentSchema.shape.title,
  team_work: AssessmentSchema.shape.team_work.nullable(),
  modern_access_control: AssessmentSchema.shape.modern_access_control,
  authorized: z.boolean(),
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_color: AssessmentSetSchema.shape.color,
  label: z.string(),
  credit_date_string: z.string(),
  active: AssessmentAccessRuleSchema.shape.active,
  access_rules: SprocAuthzAssessmentSchema.shape.access_rules,
  access_timeline: z.array(AccessTimelineEntrySchema).optional().default([]),
  show_closed_assessment_score: AssessmentAccessRuleSchema.shape.show_closed_assessment_score,
  assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
  assessment_instance_open: AssessmentInstanceSchema.shape.open.nullable(),
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: z.string(),
  show_before_release: z.boolean().optional(),
  opens_at: z.string().nullable().optional(),
});
