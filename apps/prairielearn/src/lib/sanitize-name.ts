/**
 * Replace special characters in string with underscores.
 *
 * @param {String} s - The string to sanitize.
 * @return {String} A sanitized version of s.
 */
export function sanitizeString(s: string): string {
  return s.replace(/[^a-zA-Z0-9-]/g, '_');
}

/**
 * Construct a sanitized filename prefix for a course.
 *
 * @param {Object} course - The course database object.
 * @return {String} The sanitized prefix string.
 */
export function courseFilenamePrefix(course: { short_name: string }): string {
  const prefix = sanitizeString(course.short_name) + '_';
  return prefix;
}

/**
 * Construct a sanitized filename prefix for a course instance.
 *
 * @param {Object} course_instance - The course_instance database object.
 * @param {Object} course - The course database object.
 * @return {String} The sanitized prefix string.
 */
export function courseInstanceFilenamePrefix(
  course_instance: {
    short_name: string;
  },
  course: { short_name: string },
): string {
  const prefix = courseFilenamePrefix(course) + sanitizeString(course_instance.short_name) + '_';
  return prefix;
}

/**
 * Construct a sanitized filename prefix for an assessment.
 *
 * @param {Object} assessment - The assessment database object.
 * @param {Object} assessment_set - The assessment_set database object.
 * @param {Object} course_instance - The course_instance database object.
 * @param {Object} course - The course database object.
 * @return {String} The sanitized prefix string.
 */
export function assessmentFilenamePrefix(
  assessment: {
    number: string;
  },
  assessment_set: {
    abbreviation: string;
  },
  course_instance: {
    short_name: string;
  },
  course: {
    short_name: string;
  },
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
 * @param {Object} question - The question database object.
 * @param {Object} course - The course database object.
 * @return {String} The sanitized prefix string.
 */
export function questionFilenamePrefix(
  question: {
    qid: string;
  },
  course: {
    short_name: string;
  },
) {
  const prefix = courseFilenamePrefix(course) + sanitizeString(question.qid) + '_';
  return prefix;
}
