const ERR = require('async-stacktrace');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');
const { exec } = require('child_process');

const sql = sqlLoader.loadSqlEquiv(__filename);

function getCommitHash(course, callback) {
    const execOptions = {
        cwd: course.path,
        env: process.env,
    };
    exec('git rev-parse HEAD', execOptions, (err, stdout) => {
        if (err) {
            callback(new Error(`Could not get git status; exited with code ${err.code}`));
        } else {
            // stdout buffer
            callback(null, stdout.trim());
        }
    });
}

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 */
module.exports.updateCourseCommitHash = function(course, callback) {
    getCommitHash(course, (err, hash) => {
        if (ERR(err, callback)) return;
        const params = {
            course_id: course.id,
            commit_hash: hash,
        };
        sqlDb.queryOneRow(sql.update_course_commit_hash, params, (err) => {
            if (ERR(err, callback)) return;
            callback(null, hash);
        });
    });
};

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 */
module.exports.getOrUpdateCourseCommitHash = function(course, callback) {
    if (course.commit_hash) {
        callback(null, course.commit_hash);
    } else {
        module.exports.updateCourseCommitHash(course, (err, hash) => {
            if (ERR(err, callback)) return;
            callback(null, hash);
        });
    }
};
