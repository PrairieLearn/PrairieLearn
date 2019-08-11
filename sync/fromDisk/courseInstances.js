// @ts-check
const _ = require('lodash');
const { callbackify, promisify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');
const perf = require('../performance')('question');

/**
 * @param {any} courseInfo
 * @param {any} courseInstanceDB
 * @param {(err: Error | null | undefined) => void} callback
 */
module.exports.sync = function(courseInfo, courseInstanceDB, callback) {
    callbackify(async () => {
        _(courseInstanceDB)
            .groupBy('uuid')
            .each(function(courseInstances, uuid) {
                if (courseInstances.length > 1) {
                    const directories = courseInstances.map(ci => ci.directory).join(', ')
                    throw new Error(`UUID ${uuid} is used in multiple course instances: ${directories}`);
                }
            });

        const courseInstancesParam = Object.keys(courseInstanceDB).map(courseInstanceShortName => {
            const courseInstance = courseInstanceDB[courseInstanceShortName];

            const accessRules = (courseInstance.allowAccess || []).map(accessRule => ({
                role: _(accessRule).has('role') ? accessRule.role : null,
                uids: _(accessRule).has('uids') ? accessRule.uids : null,
                start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
                end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
                institution: _(accessRule).has('institution') ? accessRule.institution : 'UIUC',
            }));

            return {
                uuid: courseInstance.uuid,
                short_name: courseInstanceShortName,
                long_name: courseInstance.longName,
                number: courseInstance.number,
                display_timezone: courseInstance.timezone || courseInfo.timezone || 'America/Chicago',
                access_rules: accessRules,
            };
        });

        const params = [
            JSON.stringify(courseInstancesParam),
            courseInfo.courseId,
        ];
        const syncCourseInstancesResult = await sqldb.callOneRowAsync('sync_course_instances', params);
        const newCourseInstanceIds = syncCourseInstancesResult.rows[0].new_course_instance_ids;
        courseInstancesParam.forEach((courseInstanceParam, index) => {
            courseInstanceDB[courseInstanceParam.short_name].courseInstanceId = newCourseInstanceIds[index];
        });
    })(callback);
}

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
        institution: _(accessRule).has('institution') ? accessRule.institution : 'UIUC',
    }));

    return {
        uuid: courseInstance.uuid,
        long_name: courseInstance.longName,
        number: courseInstance.number,
        display_timezone: courseInstance.timezone || courseTimezone || 'America/Chicago',
        access_rules: accessRules,
    };
}

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [ciid: string]: any }>}
 */
module.exports.syncNew = async function(courseId, courseData) {
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

    perf.start('syncCourseInstancesSprocNew');
    const result = await sqldb.callOneRowAsync('sync_course_instances_new', params);
    perf.end('syncCourseInstancesSprocNew');

    /** @type {[string, any][]} */
    const newCourseInstances = result.rows[0].course_instance_ids;
    return newCourseInstances.reduce((acc, [shortName, id]) => {
        acc[shortName] = id;
        return acc;
    }, {});
}
