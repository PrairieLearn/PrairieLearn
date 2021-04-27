// @ts-check
// const sqldb = require('@prairielearn/prairielib/sql-db');
const path = require('path');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

/** @typedef {{ type: 'course' }} CourseInfo */
/** @typedef {{ type: 'question', qid: string }} QuestionInfo */
/** @typedef {{ type: 'courseInstance', ciid: string }} CourseInstanceInfo */
/** @typedef {{ type: 'assessment', ciid: string, aid: string }} AssessmentInfo */
/** @typedef {{ type: 'file' }} File */

/**
 * @param {string} filePath
 * @returns {CourseInfo | QuestionInfo | CourseInstanceInfo | AssessmentInfo | File}
 */
module.exports.getDetailsForFile = function(filePath) {
    const normalizedPath = path.normalize(filePath);
    const pathComponents = normalizedPath.split(path.posix.sep);
    if (pathComponents.length === 1 && pathComponents[0] === 'infoCourse.json') {
        return { type: 'course' };
    } else if (pathComponents.length === 3 && pathComponents[0] === 'courseInstances' && pathComponents[2] === 'infoCourseInstance.json') {
        const ciid = pathComponents[1];
        return { type: 'courseInstance', ciid };
    } else if (pathComponents.length === 3 && pathComponents[0] === 'questions' && pathComponents[2] === 'info.json') {
        const qid = pathComponents[1];
        return { type: 'question', qid };
    } else if (pathComponents.length === 5 && pathComponents[0] == 'courseInstances' && pathComponents[2] === 'assessments' && pathComponents[4] === 'infoAssessment.json') {
        const ciid = pathComponents[1];
        const aid = pathComponents[3];
        return { type: 'assessment', ciid, aid };
    } else {
        return { type: 'file' };
    }
};

/**
 * @param {any} courseId
 * @param {string} filePath
 * @returns {Promise<{ errors: string, warnings: string }>}
 */
module.exports.getErrorsAndWarningsForFilePath = async function(courseId, filePath) {
    const details = module.exports.getDetailsForFile(filePath);
    let queryName = null;
    let queryParams = { course_id: courseId };
    switch (details.type) {
        case 'course':
            queryName = 'select_errors_and_warnings_for_course';
            break;
        case 'question':
            queryName = 'select_errors_and_warnings_for_question';
            queryParams.qid = details.qid;
            break;
        case 'courseInstance':
            queryName = 'select_errors_and_warnings_for_course_instance';
            queryParams.ciid = details.ciid;
            break;
        case 'assessment':
            queryName = 'select_errors_and_warnings_for_assessment';
            queryParams.ciid = details.ciid;
            queryParams.aid = details.aid;
            break;
        default:
            return { errors: null, warnings: null };
    }

    const res = await sqldb.queryZeroOrOneRowAsync(sql[queryName], queryParams);
    if (res.rowCount === 0) {
        return { errors: null, warnings: null };
    }
    return {
        errors: res.rows[0].sync_errors,
        warnings: res.rows[0].sync_warnings,
    };
};
