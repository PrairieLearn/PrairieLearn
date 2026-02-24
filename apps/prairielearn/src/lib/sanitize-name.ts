import type { Assessment, AssessmentSet, Course, CourseInstance, Question } from './db-types.js';

/**
 * Replace special characters in string with underscores.
 *
 * @param s - The string to sanitize.
 * @returns A sanitized version of s.
 */
export function sanitizeString(s: string): string {
  return s.replaceAll(/[^a-zA-Z0-9-]/g, '_');
}

/**
 * Construct a sanitized filename prefix for a course.
 *
 * @param course - The course database object.
 * @param course.short_name - The short name of the course.
 * @returns The sanitized prefix string.
 */
function courseFilenamePrefix(course: Pick<Course, 'short_name'>): string {
  // In practice, course.short_name should never be null.
  const prefix = sanitizeString(course.short_name!) + '_';
  return prefix;
}

/**
 * Construct a sanitized filename prefix for a course instance.
 *
 * @param course_instance - The course_instance database object.
 * @param course_instance.short_name - The short name of the course instance.
 * @param course - The course database object.
 * @param course.short_name - The short name of the course.
 * @returns The sanitized prefix string.
 */
export function courseInstanceFilenamePrefix(
  course_instance: Pick<CourseInstance, 'short_name'>,
  course: Pick<Course, 'short_name'>,
): string {
  // In practice, course_instance.short_name should never be null.
  const prefix = courseFilenamePrefix(course) + sanitizeString(course_instance.short_name!) + '_';
  return prefix;
}

/**
 * Construct a sanitized filename prefix for an assessment.
 *
 * @param assessment - The assessment database object.
 * @param assessment.number - The number of the assessment.
 * @param assessment_set - The assessment_set database object.
 * @param assessment_set.abbreviation - The abbreviation of the assessment set.
 * @param course_instance - The course_instance database object.
 * @param course_instance.short_name - The short name of the course instance.
 * @param course - The course database object.
 * @param course.short_name - The short name of the course.
 * @returns The sanitized prefix string.
 */
export function assessmentFilenamePrefix(
  assessment: Pick<Assessment, 'number'>,
  assessment_set: Pick<AssessmentSet, 'abbreviation'>,
  course_instance: Pick<CourseInstance, 'short_name'>,
  course: Pick<Course, 'short_name'>,
): string {
  const prefix =
    courseInstanceFilenamePrefix(course_instance, course) +
    sanitizeString(assessment_set.abbreviation) +
    sanitizeString(assessment.number) +
    '_';
  return prefix;
}

/**
 * Construct a sanitized filename prefix for a question.
 *
 * @param question - The question database object.
 * @param question.qid - The question ID.
 * @param course - The course database object.
 * @param course.short_name - The short name of the course.
 * @returns The sanitized prefix string.
 */
export function questionFilenamePrefix(
  question: Pick<Question, 'qid'>,
  course: Pick<Course, 'short_name'>,
): string {
  // In practice, question.qid should never be null
  const prefix = courseFilenamePrefix(course) + sanitizeString(question.qid!) + '_';
  return prefix;
}
