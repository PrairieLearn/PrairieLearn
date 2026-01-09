import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { selectCourseHasCourseInstances } from '../models/course-instances.js';

import { type Course, CourseInstanceSchema } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export interface GettingStartedTaskInfo {
  header: string;
  description: string;
  isComplete: boolean;
  link?: string;
}

/**
 * Retrieve the getting started checklist tasks and if they are complete for a course.
 */
export async function getGettingStartedTasks({
  course,
}: {
  course: Course;
}): Promise<GettingStartedTaskInfo[]> {
  const courseHasCourseInstance = await selectCourseHasCourseInstances({ course });

  let assessmentsPageLink: string | undefined;

  // If the course has a course instance, link to the assessments page for the first course instance.
  if (courseHasCourseInstance) {
    const firstCourseInstance = await queryRow(
      sql.select_first_course_instance,
      { course_id: course.id },
      CourseInstanceSchema,
    );
    assessmentsPageLink = `/pl/course_instance/${firstCourseInstance.id}/instructor/instance_admin/assessments`;
  }

  // Check if the course has at least 2 staff members, since the
  // course creator is added by default.
  const courseHasAddedStaff = await queryRow(
    sql.select_course_has_staff,
    { course_id: course.id },
    z.boolean(),
  );

  // Check if the course has at least one non-deleted question
  const courseHasQuestions = await queryRow(
    sql.select_course_has_questions,
    { course_id: course.id },
    z.boolean(),
  );

  // Check if the course has at least one non-deleted assessment
  const courseHasAssessments = await queryRow(
    sql.select_course_has_assessments,
    { course_id: course.id },
    z.boolean(),
  );

  const tasks: GettingStartedTaskInfo[] = [
    {
      header: 'Add course staff (optional)',
      description:
        'Invite users to the course staff to help manage and deliver the course. If you are working alone, you can skip this task.',
      link: 'staff',
      isComplete: courseHasAddedStaff,
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

  return tasks;
}
