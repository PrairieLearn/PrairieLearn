const ERR = require('async-stacktrace');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * Course module.
 * @module course
 */

module.exports = {
  /**
   * Check that an assessment_instance_id really belongs to the given course_instance_id
   *
   * @param {number} assessment_instance_id - The assessment instance to check.
   * @param {number} course_instance_id - The course instance it should belong to.
   * @param {function} callback - A callback(err) function.
   */
  checkBelongs(assessment_instance_id, course_instance_id, callback) {
    const params = {
      assessment_instance_id,
      course_instance_id,
    };
    sqldb.query(sql.check_belongs, params, (err, result) => {
      if (ERR(err, callback)) return;
      if (result.rowCount !== 1) return callback(new Error('access denied'));
      callback(null);
    });
  },
};
