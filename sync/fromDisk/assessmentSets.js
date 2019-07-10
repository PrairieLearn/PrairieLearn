const sqldb = require('@prairielearn/prairielib/sql-db');
const { safeAsync } = require('../../lib/async');

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
        await sqldb.callAsync('sync_assessment_sets', params);
    }, callback);
}
