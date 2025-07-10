import z from 'zod';

import {
  StaffAssessmentInstanceSchema,
  StaffAssessmentSchema,
  StaffAssessmentSetSchema,
  StaffCourseInstanceSchema,
  StudentAssessmentInstanceSchema,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  StudentCourseInstanceSchema,
} from './client/safe-db-types.js';

const StudentGradebookRowSchema = z
  .object({
    assessment: StudentAssessmentSchema,
    assessment_instance: StudentAssessmentInstanceSchema,
    assessment_set: StudentAssessmentSetSchema,
    course_instance: StudentCourseInstanceSchema,
    show_closed_assessment_score: z.boolean(),
  })
  .brand('StudentGradebookRow');

const StaffGradebookRowSchema = z
  .object({
    assessment: StaffAssessmentSchema,
    assessment_instance: StaffAssessmentInstanceSchema,
    assessment_set: StaffAssessmentSetSchema,
    course_instance: StaffCourseInstanceSchema,
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
