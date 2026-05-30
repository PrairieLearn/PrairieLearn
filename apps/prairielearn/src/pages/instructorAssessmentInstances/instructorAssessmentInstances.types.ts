import { z } from 'zod';

import {
  StaffAssessmentInstanceSchema,
  StaffGroupSchema,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';

// A row in the assessment instances table. It is sent to a hydrated client
// component, so the per-table data is parsed with the branded `Staff*` schemas
// from `safe-db-types.ts` (see the `safe-db-types` lint rule). The remaining
// fields are values computed by the `select_assessment_instances` query that
// don't belong to a single table.
export const AssessmentInstanceRowQuerySchema = z.object({
  assessment_instance: StaffAssessmentInstanceSchema,
  user: StaffUserSchema.nullable(),
  group: StaffGroupSchema.nullable(),
  assessment_label: z.string(),
  role: z.enum(['Staff', 'Student', 'None']),
  username: z.string().nullable(),
  uid_list: z.array(z.string()).nullable(),
  user_name_list: z.array(z.string().nullable()).nullable(),
  group_roles: z.array(z.string()).nullable(),
  highest_score: z.boolean(),
  time_remaining: z.string(),
  time_remaining_sec: z.number().nullable(),
  total_time: z.string(),
  total_time_sec: z.number().nullable(),
});
type AssessmentInstanceRowQuery = z.infer<typeof AssessmentInstanceRowQuerySchema>;
export type AssessmentInstanceRow = AssessmentInstanceRowQuery & {
  date_formatted: string;
  duration_formatted: string;
};
