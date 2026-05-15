import { z } from 'zod';

import { IdSchema, IntervalSchema } from '@prairielearn/zod';

import {
  AssessmentInstanceSchema,
  GroupSchema,
  SprocUsersGetDisplayedRoleSchema,
  UserSchema,
} from '../../lib/db-types.js';

export const AssessmentInstanceRowQuerySchema = z.object({
  assessment_instance_id: IdSchema,
  assessment_label: z.string(),
  client_fingerprint_id_change_count:
    AssessmentInstanceSchema.shape.client_fingerprint_id_change_count,
  date: AssessmentInstanceSchema.shape.date,
  duration: IntervalSchema,
  group_id: AssessmentInstanceSchema.shape.team_id,
  group_name: GroupSchema.shape.name.nullable(),
  group_roles: z.array(z.string()).nullable(),
  highest_score: z.boolean(),
  max_points: AssessmentInstanceSchema.shape.max_points,
  name: UserSchema.shape.name.nullable(),
  number: AssessmentInstanceSchema.shape.number,
  open: AssessmentInstanceSchema.shape.open,
  points: AssessmentInstanceSchema.shape.points,
  role: SprocUsersGetDisplayedRoleSchema,
  score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
  time_remaining_sec: z.number().nullable(),
  time_remaining: z.string(),
  total_time_sec: z.number().nullable(),
  total_time: z.string(),
  uid_list: z.array(UserSchema.shape.uid).nullable(),
  uid: UserSchema.shape.uid.nullable(),
  user_id: UserSchema.shape.id.nullable(),
  user_name_list: z.array(UserSchema.shape.name).nullable(),
  username: z.string().nullable(),
});
type AssessmentInstanceRowQuery = z.infer<typeof AssessmentInstanceRowQuerySchema>;
export type AssessmentInstanceRow = AssessmentInstanceRowQuery & {
  date_formatted: string;
  duration_formatted: string;
};
