const ERR = require('async-stacktrace');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');
const child_process = require('child_process');

const config = require('./config');

const sql = sqlLoader.loadSqlEquiv(__filename);

function getCommitHash(course, callback) {
    const gitEnv = process.env;
    if (config.gitSshCommand != null) {
        gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
    }
    const spawnOptions = {
        cwd: course.path,
        env: gitEnv,
    };
    const proc = child_process.spawn('git', ['rev-parse', 'HEAD'], spawnOptions);

    let hash = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', data => hash += data);

    // when a process exists, first 'exit' is fired with stdio
    // streams possibly still open, then 'close' is fired once all
    // stdio is done
    proc.on('close', (code) => {
        if (code === 0) {
            callback(null, hash.trim());
        } else {
            callback(new Error(`Could not get git status; exited with code ${code}`));
        }
    });
    proc.on('error', (err) => ERR(err, callback));
}

/**
 * Loads the current commit hash from disk and stores it in the database.
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
