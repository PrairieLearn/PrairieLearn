// @ts-check
const _ = require('lodash');
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');
const perf = require('../performance')('question');

/**
 *
 * @param {import('../course-db').CourseInstance} courseInstance
 * @param {string} courseTimezone
 */
function getParamsForCourseInstance(courseInstance, courseTimezone) {
    if (!courseInstance) return null;

    const accessRules = (courseInstance.allowAccess || []).map(accessRule => ({
        role: _(accessRule).has('role') ? accessRule.role : null,
        uids: _(accessRule).has('uids') ? accessRule.uids : null,
        start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
        end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
        institution: _(accessRule).has('institution') ? accessRule.institution : null,
    }));

    const userRoles = Object.entries(courseInstance.userRoles || {})
        .filter(([_uid, role]) => role === 'Instructor' || role === 'TA');

    return {
        uuid: courseInstance.uuid,
        long_name: courseInstance.longName,
        number: courseInstance.number,
        hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
        display_timezone: courseInstance.timezone || courseTimezone || 'America/Chicago',
        access_rules: accessRules,
        user_roles: userRoles,
    };
}

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [ciid: string]: any }>}
 */
module.exports.sync = async function(courseId, courseData) {
    const courseTimezone = (courseData.course.data && courseData.course.data.timezone) || null;
    const courseInstanceParams = Object.entries(courseData.courseInstances).map(([shortName, courseIntanceData]) => {
        const { courseInstance } = courseIntanceData;
        return JSON.stringify([
            shortName,
            courseInstance.uuid,
            infofile.stringifyErrors(courseInstance),
            infofile.stringifyWarnings(courseInstance),
            getParamsForCourseInstance(courseInstance.data, courseTimezone),
        ]);
    });

    const params = [
        courseInstanceParams,
        courseId,
    ];

    perf.start('sproc:sync_course_instances');
    const result = await sqldb.callOneRowAsync('sync_course_instances', params);
    perf.end('sproc:sync_course_instances');

    /** @type {[string, any][]} */
    const nameToIdMap = result.rows[0].name_to_id_map;
    return nameToIdMap;
};
