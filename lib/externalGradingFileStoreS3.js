const ERR = require('async-stacktrace');
const async = require('async');
const tar = require('tar');
const AWS = require('aws-sdk');
const tmp = require('tmp');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const config = require('./config');
const externalGraderCommon = require('./externalGraderCommon');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.createFilesForJob = function(grading_job, submission, variant, question, course, callback) {

    let dir;
    let cleanup;
    const s3RootKey = `job_${grading_job.id}`;

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
            // Now that we've built up our directory, let's zip it up and send
            // it off to S3
            let tarball = tar.create({
                gzip: true,
                cwd: dir,
            }, ['.']);

            const params = {
                Bucket: config.externalGradingS3Bucket,
                Key: `${s3RootKey}/job.tar.gz`,
            };

            let s3Stream = require('s3-upload-stream')(new AWS.S3());
            let upload = s3Stream.upload(params);
            upload.on('error', (err) => ERR(err, callback));
            upload.on('uploaded', () => callback(null));

            tarball.pipe(upload);
        },
        (callback) => {
            // Store S3 info for this job
            const params = {
                grading_job_id: grading_job.id,
                s3_bucket: config.externalGradingS3Bucket,
                s3_root_key: s3RootKey,
            };
            sqldb.query(sql.update_s3_info, params, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        // Since files are now in the tarball, we can remove the temporary directory
        cleanup();
        if (ERR(err, callback)) return;
        callback(null);
    });
};
