import { z } from 'zod';

import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  UserSchema,
} from '../../lib/db-types.js';

export const CourseAssessmentRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_number: AssessmentSchema.shape.number,
  assessment_set_number: AssessmentSetSchema.shape.number,
  color: AssessmentSetSchema.shape.color,
  label: z.string(),
});
export type CourseAssessmentRow = z.infer<typeof CourseAssessmentRowSchema>;

export interface InstructorGradebookData {
  urlPrefix: string;
  csvFilename: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  courseAssessments: CourseAssessmentRow[];
}

export const AssessmentInstanceScoreResultSchema = z.object({
  user_id: UserSchema.shape.user_id,
  assessment_id: AssessmentInstanceSchema.shape.assessment_id,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
  assessment_instance_id: AssessmentInstanceSchema.shape.id,
});
export type AssessmentInstanceScoreResult = z.infer<typeof AssessmentInstanceScoreResultSchema>;

export const GradebookRowSchema = z.object({
  user_id: UserSchema.shape.user_id,
  uid: UserSchema.shape.uid,
  uin: UserSchema.shape.uin,
  user_name: UserSchema.shape.name,
  role: z.enum(['Staff', 'Student', 'None']),
  scores: z.record(
    AssessmentSchema.shape.id,
    z.object({
      score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
      assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
      uid_other_users_group: UserSchema.shape.uid.array(),
    }),
  ),
});
export type GradebookRow = z.infer<typeof GradebookRowSchema>;
