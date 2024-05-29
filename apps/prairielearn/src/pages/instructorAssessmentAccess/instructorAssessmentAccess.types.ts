import { z } from 'zod';

export const AssessmentAccessRulesSchema = z.object({
  mode: z.string(),
  uids: z.string(),
  start_date: z.string(),
  formatted_start_date: z.date().optional(),
  end_date: z.string(),
  formatted_end_date: z.date().optional(),
  credit: z.string(),
  time_limit: z.string(),
  password: z.string(),
  exam_uuid: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  active: z.string(),
});
export type AssessmentAccessRules = z.infer<typeof AssessmentAccessRulesSchema>;
