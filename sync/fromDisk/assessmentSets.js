const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports.sync = function(courseInfo, courseInstances, callback) {
    callbackify(async () => {
        const assessmentSets = courseInfo.assessmentSets || [];

        // We'll create placeholder assessment sets for anything specified in
        // an assessment but not in infoCourse.json. This is similar to how we
        // handle missing tags/topics.
        const knownAssessmentSetNames = new Set(assessmentSets.map(aset => aset.name));
        const missingAssessmentSetNames = new Set();
        Object.values(courseInstances).forEach((courseInstance) => {
            Object.values(courseInstance.assessmentDB).forEach(assessment => {
                if (!knownAssessmentSetNames.has(assessment.set)) {
                    missingAssessmentSetNames.add(assessment.set);
                }
            });
        });
        assessmentSets.push(...[...missingAssessmentSetNames].map(name => ({
            name,
            abbreviation: name,
            color: 'gray1',
            heading: `${name} (auto-generated from use in a question; add this assessment set to your courseInfo.json file to customize)`,
        })));

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
        const result = await sqldb.callOneRowAsync('sync_assessment_sets', params);
        return result.rows[0].used_assessment_set_ids;
    })(callback);
}

module.exports.deleteUnused = function(courseInfo, usedAssessmentSetIds, callback) {
    callbackify(async () => {
        const params = [
            usedAssessmentSetIds,
            courseInfo.courseId,
        ];
        await sqldb.callAsync('sync_assessment_sets_delete_unused', params);
    })(callback);
}
