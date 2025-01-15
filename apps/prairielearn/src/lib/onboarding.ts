import {
  selectCourseHasCourseInstances,
  selectFirstCourseInstance,
} from '../models/course-instances.js';
import { selectCourseHasAddedStaff } from '../models/course-permissions.js';
import { selectCourseHasQuestions } from '../models/questions.js';

import { selectCourseHasAssessments } from './assessment.js';

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

  const steps: OnboardingStepInfo[] = [
    {
      header: 'Add course staff',
      description:
        'Invite users to the course staff to help manage and deliver the course. If you are working alone, you can skip this step.',
      link: 'staff',
      isComplete: await selectCourseHasAddedStaff({ course_id }),
      optional: true,
    },
    {
      header: 'Create a question',
      description:
        "A question is a problem or task that tests a student's understanding of a specific concept.",
      link: 'questions',
      isComplete: await selectCourseHasQuestions({ course_id }),
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
      isComplete: await selectCourseHasAssessments({ course_id }),
    },
  ];

  return steps;
}
