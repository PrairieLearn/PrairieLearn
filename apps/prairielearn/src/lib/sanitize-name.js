module.exports = {
  /**
   * Replace special characters in string with underscores.
   *
   * @param {String} s - The string to sanitize.
   * @return {String} A sanitized version of s.
   */
  sanitizeString(s) {
    return s.replace(/[^a-zA-Z0-9-]/g, '_');
  },

  /**
   * Construct a sanitized filename prefix for a course.
   *
   * @param {Object} course - The course database object.
   * @return {String} The sanitized prefix string.
   */
  courseFilenamePrefix(course) {
    const prefix = this.sanitizeString(course.short_name) + '_';
    return prefix;
  },

  /**
   * Construct a sanitized filename prefix for a course instance.
   *
   * @param {Object} course_instance - The course_instance database object.
   * @param {Object} course - The course database object.
   * @return {String} The sanitized prefix string.
   */
  courseInstanceFilenamePrefix(course_instance, course) {
    const prefix =
      this.courseFilenamePrefix(course) + this.sanitizeString(course_instance.short_name) + '_';
    return prefix;
  },

  /**
   * Construct a sanitized filename prefix for an assessment.
   *
   * @param {Object} assessment - The assessment database object.
   * @param {Object} assessment_set - The assessment_set database object.
   * @param {Object} course_instance - The course_instance database object.
   * @param {Object} course - The course database object.
   * @return {String} The sanitized prefix string.
   */
  assessmentFilenamePrefix(assessment, assessment_set, course_instance, course) {
    const prefix =
      this.courseInstanceFilenamePrefix(course_instance, course) +
      this.sanitizeString(assessment_set.abbreviation) +
      this.sanitizeString(assessment.number) +
      '_';
    return prefix;
  },

  /**
   * Construct a sanitized filename prefix for a question.
   *
   * @param {Object} question - The question database object.
   * @param {Object} course - The course database object.
   * @return {String} The sanitized prefix string.
   */
  questionFilenamePrefix(question, course) {
    const prefix = this.courseFilenamePrefix(course) + this.sanitizeString(question.qid) + '_';
    return prefix;
  },
};
