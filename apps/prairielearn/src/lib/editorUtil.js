// @ts-check
// const sqldb = require('@prairielearn/postgres')
import * as path from 'path';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

/** @typedef {{ type: 'course' }} CourseInfo */
/** @typedef {{ type: 'question', qid: string }} QuestionInfo */
/** @typedef {{ type: 'courseInstance', ciid: string }} CourseInstanceInfo */
/** @typedef {{ type: 'assessment', ciid: string, aid: string }} AssessmentInfo */
/** @typedef {{ type: 'file' }} File */

/**
 * @param {string} filePath
 * @returns {CourseInfo | QuestionInfo | CourseInstanceInfo | AssessmentInfo | File}
 */
export function getDetailsForFile(filePath) {
  const normalizedPath = path.normalize(filePath);
  const pathComponents = normalizedPath.split(path.posix.sep);
  if (pathComponents.length === 1 && pathComponents[0] === 'infoCourse.json') {
    return { type: 'course' };
  } else if (
    pathComponents.length >= 3 &&
    pathComponents[0] === 'courseInstances' &&
    pathComponents[pathComponents.length - 1] === 'infoCourseInstance.json'
  ) {
    const ciid = pathComponents.slice(1, pathComponents.length - 1).join(path.posix.sep);
    return { type: 'courseInstance', ciid };
  } else if (
    pathComponents.length >= 3 &&
    pathComponents[0] === 'questions' &&
    pathComponents[pathComponents.length - 1] === 'info.json'
  ) {
    const qid = pathComponents.slice(1, pathComponents.length - 1).join(path.posix.sep);
    return { type: 'question', qid };
  } else if (
    pathComponents.length >= 5 &&
    pathComponents[0] === 'courseInstances' &&
    pathComponents.slice(2, pathComponents.length - 2).some((e) => e === 'assessments') &&
    pathComponents[pathComponents.length - 1] === 'infoAssessment.json'
  ) {
    const assessment_index =
      pathComponents.slice(2, pathComponents.length - 2).findIndex((e) => e === 'assessments') + 2;
    const ciid = pathComponents.slice(1, assessment_index).join(path.posix.sep);
    const aid = pathComponents
      .slice(assessment_index + 1, pathComponents.length - 1)
      .join(path.posix.sep);
    return { type: 'assessment', ciid, aid };
  } else {
    return { type: 'file' };
  }
}

/**
 * @param {any} courseId
 * @param {string} filePath
 * @returns {Promise<{ errors: string | null, warnings: string | null }>}
 */
export async function getErrorsAndWarningsForFilePath(courseId, filePath) {
  const details = getDetailsForFile(filePath);
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
}
