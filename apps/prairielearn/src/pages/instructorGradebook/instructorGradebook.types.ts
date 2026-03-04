import { z } from 'zod';

import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  EnrollmentSchema,
  SprocUsersGetDisplayedRoleSchema,
  UserSchema,
} from '../../lib/db-types.js';

export const CourseAssessmentRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_number: AssessmentSchema.shape.number,
  assessment_set_number: AssessmentSetSchema.shape.number,
  assessment_set_id: AssessmentSetSchema.shape.id,
  assessment_set_heading: z.string(),
  color: AssessmentSetSchema.shape.color,
  label: z.string(),
});
export type CourseAssessmentRow = z.infer<typeof CourseAssessmentRowSchema>;

export const AssessmentInstanceScoreResultSchema = z.object({
  user_id: UserSchema.shape.id,
  assessment_id: AssessmentInstanceSchema.shape.assessment_id,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
  assessment_instance_id: AssessmentInstanceSchema.shape.id,
});

export const OtherGroupUserSchema = z.object({
  uid: UserSchema.shape.uid,
  enrollment_id: EnrollmentSchema.shape.id.nullable(),
});
export type OtherGroupUser = z.infer<typeof OtherGroupUserSchema>;

export const GradebookRowSchema = z.object({
  user_id: UserSchema.shape.id,
  uid: UserSchema.shape.uid,
  uin: UserSchema.shape.uin,
  user_name: UserSchema.shape.name,
  role: SprocUsersGetDisplayedRoleSchema,
  enrollment: StaffEnrollmentSchema.nullable(),
  scores: z.record(
    AssessmentSchema.shape.id,
    z.object({
      score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
      assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
      uid_other_users_group: OtherGroupUserSchema.array(),
    }),
  ),
});
export type GradebookRow = z.infer<typeof GradebookRowSchema>;
