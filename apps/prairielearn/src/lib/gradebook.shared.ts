import z from 'zod';

import {
  RawStaffAssessmentInstanceSchema,
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStaffCourseInstanceSchema,
  RawStudentAssessmentInstanceSchema,
  RawStudentAssessmentSchema,
  RawStudentAssessmentSetSchema,
  RawStudentCourseInstanceSchema,
} from './client/safe-db-types.js';

const StudentGradebookRowSchema = z
  .object({
    assessment: RawStudentAssessmentSchema,
    assessment_instance: RawStudentAssessmentInstanceSchema,
    assessment_set: RawStudentAssessmentSetSchema,
    course_instance: RawStudentCourseInstanceSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .brand('StudentGradebookRow');

const StaffGradebookRowSchema = z
  .object({
    assessment: RawStaffAssessmentSchema,
    assessment_instance: RawStaffAssessmentInstanceSchema,
    assessment_set: RawStaffAssessmentSetSchema,
    course_instance: RawStaffCourseInstanceSchema,
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
