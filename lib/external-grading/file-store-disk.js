const ERR = require('async-stacktrace');
const async = require('async');
const path = require('path');
const fs = require('fs-extra');
const tar = require('tar');
const tmp = require('tmp');

const externalGraderCommon = require('./common');

module.exports.createFilesForJob = function(grading_job, submission, variant, question, course, callback) {

    const storageDir = externalGraderCommon.getJobDirectory(grading_job.id);
    let dir;
    let cleanup;

    async.series([
        (callback) => {
            tmp.dir({ unsafeCleanup: true }, (err, path, cleanupCallback) => {
                if (ERR(err, callback)) return;
                dir = path;
                cleanup = cleanupCallback;
                callback(null);
            });
        },
        (callback) => {
            externalGraderCommon.buildDirectory(dir, submission, variant, question, course, callback);
        },
        (callback) => {
            fs.mkdirs(storageDir, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // Now that we've built up our directory, let's zip it up and send
            // it off to S3
            let tarball = tar.create({
                gzip: true,
                cwd: dir,
            }, ['.']);

            const jobFile = path.join(storageDir, 'job.tar.gz');

            const stream = tarball.pipe(fs.createWriteStream(jobFile));
            stream.on('error', (err) => ERR(err, callback));
            stream.on('finish', () => callback(null));
        },
    ], (err) => {
        // Since files are now in S3, we can remore the temporary directory
        cleanup();
        if (ERR(err, callback)) return;
        callback(null);
    });
};
