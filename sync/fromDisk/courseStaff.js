const logger = require('../../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const config = require('../../lib/config');

function asyncCall(sql, params) {
    return new Promise((resolve, reject) => {
        sqldb.call(sql, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    })
}

function safeAsync(func, callback) {
    new Promise(async () => {
        let error = null;
        let result;
        try {
            result = await func();
        } catch (err) {
            error = err;
        }
        callback(error, result);
    });
};

module.exports.sync = function(courseInstance, callback) {
    safeAsync(async () => {
        logger.debug('Syncing instructors and TAs');
        const userRoles = courseInstance.userRoles || {};
        if (config.devMode) {
            // Make the dev user an instructor
            userRoles['dev@illinois.edu'] = 'Instructor';
        }

        // Consists of an array of [uid, role] pairs
        const usersToSync = Object
            .entries(userRoles)
            .filter(([_, role]) => role === 'Instructor' || role === 'TA');

        const params = [
            JSON.stringify(usersToSync),
            courseInstance.courseInstanceId,
        ];
        await asyncCall('sync_course_staff', params);
    }, callback);
}
