const _ = require('lodash');
const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

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
                institution: _(accessRule).has('institution') ? accessRule.institution : null,
            }));

            return {
                uuid: courseInstance.uuid,
                short_name: courseInstanceShortName,
                long_name: courseInstance.longName,
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
