// @ts-check
const _ = require('lodash');
const { callbackify, promisify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');

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
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [ciid: string]: any }>}
 */
module.exports.syncNew = async function(courseId, courseData) {
    // Transform data into format expected by old function
    const oldCourseInstances = {};
    Object.entries(courseData.courseInstances).forEach(([ciid, courseInstance]) => {
        if (infofile.hasErrors(courseInstance.courseInstance)) {
            // Skip it for now
            // TODO: write errors to DB, don't delete broken instance
            return;
        }
        oldCourseInstances[ciid] = courseInstance.courseInstance.data;
    });

    const courseInfo = {
        courseId,
        timezone: (courseData.course.data && courseData.course.data.timezone),
    };
    await promisify(module.exports.sync)(courseInfo, oldCourseInstances);

    // Extract and return new IDs
    const courseInstanceIds = {};
    Object.entries(oldCourseInstances).forEach(([ciid, courseInstance]) => {
        courseInstanceIds[ciid] = courseInstance.courseInstanceId;
    });
    return courseInstanceIds;
}
