// @ts-check
const sqldb = require('@prairielearn/prairielib/sql-db');

const infofile = require('../infofile');
const perf = require('../performance')('assessmentSets');

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

    perf.start('sproc:sync_assessment_sets');
    const res = await sqldb.callOneRowAsync('sync_assessment_sets', params);
    perf.end('sproc:sync_assessment_sets');
    const usedAssessmentSetIds = res.rows[0].used_assessment_set_ids;

    return { deleteUnused, usedAssessmentSetIds }
}

/**
 * @param {any} courseId
 * @param {any[]} usedAssessmentSetIds
 */
module.exports.deleteUnusedNew = async function(courseId, usedAssessmentSetIds) {
    const params = [ usedAssessmentSetIds, courseId];
    await sqldb.callAsync('sync_assessment_sets_delete_unused', params);
}
