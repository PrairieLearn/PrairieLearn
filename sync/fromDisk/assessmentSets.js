// @ts-check
const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');

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

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ deleteUnused: boolean, usedAssessmentSetIds: any[] }>}
 */
module.exports.syncNew = async function(courseId, courseData) {
    // We can only safely remove unused assessment sets if both `infoCourse.json`
    // and all `infoAssessment.json` files are valid.
    const isInfoCourseValid = !infofile.hasErrors(courseData.course);
    const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every(ci => {
        return Object.values(ci.assessments).every(a => !infofile.hasErrors(a));
    });
    const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

    /** @type {string[]} */
    let courseAssessmentSets = [];
    if (!infofile.hasErrors(courseData.course)) {
        courseAssessmentSets = courseData.course.data.assessmentSets.map(t => JSON.stringify([
            t.name,
            t.abbreviation,
            t.heading,
            t.color,
        ]));
    }

    /** @type Set<string> */
    const knownAssessmentSetNames = new Set();
    Object.values(courseData.courseInstances).forEach(ci => {
        Object.values(ci.assessments).forEach(a => {
            if (!infofile.hasErrors(a)) {
                knownAssessmentSetNames.add(a.data.set);
            }
        });
    });
    const assessmentSetNames = [...knownAssessmentSetNames];

    const params = [
        !infofile.hasErrors(courseData.course),
        courseAssessmentSets,
        assessmentSetNames,
        courseId,
    ];

    const res = await sqldb.callOneRowAsync('sync_assessment_sets_new', params);
    const usedAssessmentSetIds = res.rows[0].used_assessment_set_ids;

    return { deleteUnused, usedAssessmentSetIds }
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

/**
 * @param {any} courseId
 * @param {any[]} usedAssessmentSetIds
 */
module.exports.deleteUnusedNew = async function(courseId, usedAssessmentSetIds) {
    const params = [ usedAssessmentSetIds, courseId];
    await sqldb.callAsync('sync_assessment_sets_delete_unused', params);
}
