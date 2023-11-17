import ERR from 'async-stacktrace';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Check that an assessment_instance_id really belongs to the given course_instance_id
 *
 * @param {number} assessment_instance_id - The assessment instance to check.
 * @param {number} course_instance_id - The course instance it should belong to.
 * @param {function} callback - A callback(err) function.
 */
export function checkBelongs(assessment_instance_id, course_instance_id, callback) {
  const params = {
    assessment_instance_id,
    course_instance_id,
  };
  sqldb.query(sql.check_belongs, params, (err, result) => {
    if (ERR(err, callback)) return;
    if (result.rowCount !== 1) return callback(new Error('access denied'));
    callback(null);
  });
}

/**
 * Return the name and UID (email) for every owner of the specified course.
 *
 * @param {string | number} course_id The ID of the course.
 * @returns {Promise<{ uid: string, name?: string }[]>}
 */
export async function getCourseOwners(course_id) {
  const { rows } = await sqldb.queryAsync(sql.select_owners, { course_id });
  return rows.map((row) => ({
    uid: row.uid,
    name: row.name,
  }));
}

export function getLockNameForCoursePath(coursePath) {
  return `coursedir:${coursePath}`;
}
