const sqldb = require('@prairielearn/prairielib/sql-db');

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

module.exports.sync = function(courseInfo, callback) {
    safeAsync(async () => {
        const assessmentSets = courseInfo.assessmentSets || [];
        const assessmentSetsParams = assessmentSets.map((assessmentSet, index) => ({
            abbreviation: assessmentSet.abbreviation,
            name: assessmentSet.name,
            heading: assessmentSet.heading,
            color: assessmentSet.color,
            number: index + 1,
        }));

        const params = [
            JSON.stringify(assessmentSetsParams),
            courseInfo.courseId,
        ];
        await asyncCall('sync_assessment_sets', params);
    }, callback);
}
