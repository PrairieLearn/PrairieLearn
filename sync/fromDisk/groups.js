const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');
const logger = require('../../lib/logger');

module.exports.sync = function(courseInfo, courseInstance, callback) {
    callbackify(async () => {
        logger.debug('Syncing groups');
        const userGroups = courseInstance.groups || {};
        const params = [
            JSON.stringify(userGroups),
            courseInstance.courseInstanceId,
        ];
        await sqldb.callAsync('sync_groups', params);
    })(callback);
};
