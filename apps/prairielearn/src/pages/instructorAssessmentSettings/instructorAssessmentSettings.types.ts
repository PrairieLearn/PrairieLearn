import z from 'zod';

export const SettingsFormBodySchema = z.object({
  aid: z.string(),
  title: z.string(),
  set: z.string(),
  number: z.string(),
  module: z.string(),
  text: z.string().optional(),
  allow_issue_reporting: z.boolean(),
  allow_personal_notes: z.boolean(),
  multiple_instance: z.boolean(),
  auto_close: z.boolean(),
  require_honor_code: z.boolean(),
  honor_code: z.string().optional(),
  max_points: z.number().nullable(),
  max_bonus_points: z.number().nullable(),
  constant_question_value: z.boolean(),
  shuffle_questions: z.boolean(),
  advance_score_perc: z.number().nullable(),
  allow_real_time_grading: z.boolean(),
  grade_rate_minutes: z.number().nullable(),
  tools: z.record(z.string(), z.boolean()).optional(),
});

export type SettingsFormValues = z.infer<typeof SettingsFormBodySchema>;
