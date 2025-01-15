import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import {
  selectCourseHasCourseInstances,
  selectFirstCourseInstance,
} from '../models/course-instances.js';

const sql = loadSqlEquiv(import.meta.url);

export interface OnboardingStepInfo {
  header: string;
  description: string;
  isComplete: boolean;
  link?: string;
  optional?: boolean;
}

/**
 * Retrieve the onboarding steps and if they are complete for a course.
 */
export async function getOnboardingSteps({
  course_id,
}: {
  course_id: string;
}): Promise<OnboardingStepInfo[]> {
  const courseHasCourseInstance = await selectCourseHasCourseInstances({ course_id });

  let assessmentsPageLink: string | undefined;

  // If the course has a course instance, link to the assessments page for the first course instance.
  // Otherwise, the Create an assessment task will have no link.
  if (courseHasCourseInstance) {
    const first_course_instance = await selectFirstCourseInstance({ course_id });
    assessmentsPageLink = `/pl/course_instance/${first_course_instance.id}/instructor/instance_admin/assessments`;
  }

  // Check if the course has at least 2 staff members (since each course starts with one staff member)
  const courseHasAddedStaff = await queryRow(
    sql.select_course_has_staff,
    {
      course_id,
    },
    z.boolean(),
  );

  // Check if the course has at least one non-deleted question
  const courseHasQuestions = await queryRow(
    sql.select_course_has_questions,
    { course_id },
    z.boolean(),
  );

  // Check if the course has at least one non-deleted assessment
  const courseHasAssessments = await queryRow(
    sql.select_course_has_assessments,
    { course_id },
    z.boolean(),
  );

  const steps: OnboardingStepInfo[] = [
    {
      header: 'Add course staff',
      description:
        'Invite users to the course staff to help manage and deliver the course. If you are working alone, you can skip this step.',
      link: 'staff',
      isComplete: courseHasAddedStaff,
      optional: true,
    },
    {
      header: 'Create a question',
      description:
        "A question is a problem or task that tests a student's understanding of a specific concept.",
      link: 'questions',
      isComplete: courseHasQuestions,
    },
    {
      header: 'Create a course instance',
      description:
        'A course instance contains the assessments and other configuration for a single offering of a course.',
      link: 'instances',
      isComplete: courseHasCourseInstance,
    },
    {
      header: 'Create an assessment',
      description:
        "An assessment is a collection of questions designed to build or evaluate a student's knowledge.",
      link: assessmentsPageLink,
      isComplete: courseHasAssessments,
    },
  ];

  return steps;
}
