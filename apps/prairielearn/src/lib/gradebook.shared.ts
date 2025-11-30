import { z } from 'zod';

import {
  RawStaffAssessmentInstanceSchema,
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStudentAssessmentInstanceSchema__UNSAFE,
  RawStudentAssessmentSchema,
  RawStudentAssessmentSetSchema,
} from './client/safe-db-types.js';

const StudentGradebookRowSchema = z
  .object({
    assessment: RawStudentAssessmentSchema,
    assessment_instance: RawStudentAssessmentInstanceSchema__UNSAFE,
    assessment_set: RawStudentAssessmentSetSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .transform((data) => {
    // TODO: Instead of doing a single parse from the database,
    // we should return the raw data from the database, and parse that data
    // again with additional authorization context to narrow the return type.

    if (!data.show_closed_assessment_score) {
      data.assessment_instance.points = null;
      data.assessment_instance.score_perc = null;
    }
    return data;
  })
  .brand('StudentGradebookRow');

const StaffGradebookRowSchema = z
  .object({
    assessment: RawStaffAssessmentSchema,
    assessment_instance: RawStaffAssessmentInstanceSchema,
    assessment_set: RawStaffAssessmentSetSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .brand('StaffGradebookRow');

type StudentGradebookRow = z.infer<typeof StudentGradebookRowSchema>;
type StaffGradebookRow = z.infer<typeof StaffGradebookRowSchema>;

function computeTitle({
  assessment,
  assessment_instance,
}: StudentGradebookRow | StaffGradebookRow) {
  if (assessment.multiple_instance) {
    return `${assessment.title} instance #${assessment_instance.number}`;
  }
  return assessment.title ?? '';
}

function computeLabel({
  assessment,
  assessment_instance,
  assessment_set,
}: StudentGradebookRow | StaffGradebookRow) {
  if (assessment.multiple_instance) {
    return `${assessment_set.abbreviation}${assessment.number}#${assessment_instance.number}`;
  }
  return `${assessment_set.abbreviation}${assessment.number}`;
}

export {
  StudentGradebookRowSchema,
  StaffGradebookRowSchema,
  type StudentGradebookRow,
  type StaffGradebookRow,
  computeTitle,
  computeLabel,
};
