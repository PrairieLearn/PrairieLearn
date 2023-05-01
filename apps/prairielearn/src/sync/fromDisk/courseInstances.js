// @ts-check
const _ = require('lodash');
const sqldb = require('@prairielearn/postgres');

const infofile = require('../infofile');
const perf = require('../performance')('question');

/**
 *
 * @param {import('../course-db').CourseInstance | null | undefined} courseInstance
 * @param {string | null} courseTimezone
 */
function getParamsForCourseInstance(courseInstance, courseTimezone) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = (courseInstance.allowAccess || [])
    .filter((accessRule) => !_(accessRule).has('role') || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: _(accessRule).has('uids') ? accessRule.uids : null,
      start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
      end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
      institution: _(accessRule).has('institution') ? accessRule.institution : null,
    }));

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    number: courseInstance.number,
    hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
    display_timezone: courseInstance.timezone || courseTimezone || 'America/Chicago',
    access_rules: accessRules,
    assessments_group_by: courseInstance.groupAssessmentsBy,
  };
}

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [ciid: string]: any }>}
 */
module.exports.sync = async function (courseId, courseData) {
  const courseTimezone = (courseData.course.data && courseData.course.data.timezone) || null;
  const courseInstanceParams = Object.entries(courseData.courseInstances).map(
    ([shortName, courseIntanceData]) => {
      const { courseInstance } = courseIntanceData;
      return JSON.stringify([
        shortName,
        courseInstance.uuid,
        infofile.stringifyErrors(courseInstance),
        infofile.stringifyWarnings(courseInstance),
        getParamsForCourseInstance(courseInstance.data, courseTimezone),
      ]);
    }
  );

  const params = [courseInstanceParams, courseId];

  perf.start('sproc:sync_course_instances');
  const result = await sqldb.callOneRowAsync('sync_course_instances', params);
  perf.end('sproc:sync_course_instances');

  /** @type {[string, any][]} */
  const nameToIdMap = result.rows[0].name_to_id_map;
  return nameToIdMap;
};
