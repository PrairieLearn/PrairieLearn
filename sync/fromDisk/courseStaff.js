const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');
const logger = require('../../lib/logger');
const config = require('../../lib/config');

module.exports.sync = function(courseInstance, callback) {
    callbackify(async () => {
        logger.debug('Syncing instructors and TAs');
        const userRoles = courseInstance.userRoles || {};
        if (config.devMode) {
            // Make the dev user an instructor
            userRoles['dev@illinois.edu'] = 'Instructor';
        }

        // Consists of an array of [uid, role] pairs
        // IMPORTANT: these must be sorted by UID to avoid deadlock in the DB.
        // We attempt to sync multiple course instances at the same time, and
        // we might be trying to create the same user in multiple transactions.
        const usersToSync = Object
            .entries(userRoles)
            .filter(([_, role]) => role === 'Instructor' || role === 'TA')
            .sort((entryA, entryB) => {
                if (entryA[0] < entryB[0]) {
                    return -1;
                }
                if (entryA[0] > entryB[0]) {
                    return 1;
                }
                return 0;
            });

        const params = [
            JSON.stringify(usersToSync),
            courseInstance.courseInstanceId,
        ];
        await sqldb.callAsync('sync_course_staff', params);
    })(callback);
};
