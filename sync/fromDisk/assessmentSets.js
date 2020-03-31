const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports.sync = function(courseInfo, callback) {
    callbackify(async () => {
        const assessmentSets = courseInfo.assessmentSets || [];
        const assessmentSetsParams = assessmentSets.map((assessmentSet) => ({
            abbreviation: assessmentSet.abbreviation,
            name: assessmentSet.name,
            heading: assessmentSet.heading,
            color: assessmentSet.color,
        }));

        const params = [
            JSON.stringify(assessmentSetsParams),
            courseInfo.courseId,
        ];
        await sqldb.callAsync('sync_assessment_sets', params);
    })(callback);
};
