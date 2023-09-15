const ERR = require('async-stacktrace');
const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');
const { exec } = require('child_process');
const { promisify } = require('util');

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @param {string} coursePath
 * @param {(err: Error, hash: string) => void} callback
 */
function getCommitHash(coursePath, callback) {
  const execOptions = {
    cwd: coursePath,
    env: process.env,
  };
  exec('git rev-parse HEAD', execOptions, (err, stdout, stderr) => {
    if (err) {
      callback(
        error.makeWithData(`Could not get git status; exited with code ${err.code}`, {
          stdout,
          stderr,
        }),
      );
    } else {
      // stdout buffer
      callback(null, stdout.trim());
    }
  });
}
module.exports.getCommitHash = getCommitHash;
module.exports.getCommitHashAsync = promisify(getCommitHash);

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 *
 * @param {Object} course
 * @param {(err?: Error, commitHash: string) => void} callback
 */
module.exports.updateCourseCommitHash = function (course, callback) {
  getCommitHash(course.path, (err, hash) => {
    if (ERR(err, callback)) return;
    const params = {
      course_id: course.id,
      commit_hash: hash,
    };
    sqldb.queryOneRow(sql.update_course_commit_hash, params, (err) => {
      if (ERR(err, callback)) return;
      callback(null, hash);
    });
  });
};

module.exports.updateCourseCommitHashAsync = promisify(module.exports.updateCourseCommitHash);

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 *
 * @param {Object} course
 * @param {(err?: Error, commitHash: string) => void} callback
 */
module.exports.getOrUpdateCourseCommitHash = function (course, callback) {
  if (course.commit_hash) {
    callback(null, course.commit_hash);
  } else {
    module.exports.updateCourseCommitHash(course, (err, hash) => {
      if (ERR(err, callback)) return;
      callback(null, hash);
    });
  }
};

module.exports.getOrUpdateCourseCommitHashAsync = promisify(
  module.exports.getOrUpdateCourseCommitHash,
);
