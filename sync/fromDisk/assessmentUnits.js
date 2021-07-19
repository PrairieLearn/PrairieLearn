// @ts-check
const sqldb = require('../../prairielib/lib/sql-db');
const infofile = require('../infofile');

const perf = require('../performance')('assessmentUnits');

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 */
module.exports.sync = async function(courseId, courseData) {
    // We can only safely remove unused assessment units if both `infoCourse.json`
    // and all `infoAssessment.json` files are valid.
    const isInfoCourseValid = !infofile.hasErrors(courseData.course);
    const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every(ci => {
        return Object.values(ci.assessments).every(a => !infofile.hasErrors(a));
    });
    const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

    /** @type {string[]} */
    let courseAssessmentUnits = [];
    if (!infofile.hasErrors(courseData.course)) {
        courseAssessmentUnits = courseData.course.data.assessmentUnits.map(u => JSON.stringify([
            u.name,
            u.heading,
        ]));
    }

    /** @type Set<string> */
    const knownAssessmentUnitNames = new Set();
    Object.values(courseData.courseInstances).forEach(ci => {
        Object.values(ci.assessments).forEach(a => {
            if (!infofile.hasErrors(a) && a.data.unit !== undefined) {
                knownAssessmentUnitNames.add(a.data.unit);
            }
        });
    });
    const assessmentUnitNames = [...knownAssessmentUnitNames];

    const params = [
        isInfoCourseValid,
        deleteUnused,
        courseAssessmentUnits,
        assessmentUnitNames,
        courseId,
    ];

    perf.start('sproc:sync_assessment_units');
    await sqldb.callOneRowAsync('sync_assessment_units', params);
    perf.end('sproc:sync_assessment_units');
};