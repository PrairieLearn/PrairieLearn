/**
 * Runs a load test on our external grading infrastructure.
 */
const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const SHA256 = require('crypto-js/sha256');
const tmp = require('tmp');


const logger = require('../../lib/logger');
const externalGraderCommon = require('../../lib/externalGraderCommon');
const externalGraderAWS = require('../../lib/externalGraderAWS');

if (fs.existsSync('./aws-config.json')) {
    logger.info('Loading AWS credentials...');
    AWS.config.loadFromPath('./aws-config.json');
} else {
    logger.info('Missing \'aws-config.json\' in project root!');
    process.exit(1);
}

var S3 = new AWS.S3();
const bucketBaseName = SHA256(new Date().toString());
const jobsBucketName = `${bucketBaseName}.jobs`;
const resultsBucketName = `${bucketBaseName}.results`;
const archivesBucketName = `${bucketBaseName}.archives`;

const submission = {};
const question = {};
const course = {};

const directory = 'python-fibonacci';
let tempDirectory;

async.series([
    // Let's create some dedicated S3 buckets for the load test
    (callback) => {
        logger.info('Creating S3 bucket for jobs...');
        const params = {
            Bucket: jobsBucketName
        };
        S3.createBucket(params, callback);
    },
    (callback) => {
        logger.info('Creating S3 bucket for results...');
        const params = {
            Bucket: resultsBucketName
        };
        S3.createBucket(params, callback);
    },
    (callback) => {
        logger.info('Creating S3 bucket for archives...');
        const params = {
            Bucket: archivesBucketName
        };
        S3.createBucket(params, callback);
    },
    // It's time to fake a question!
    (callback) => {
        // Generate a course
        course.path = __dirname;
    },
    (callback) => {
        // Generate a question
        fs.readdir(path.join(__dirname, 'serverFilesCourse'), (err, files) => {
            if (ERR(err, callback)) return;
            question.external_grading_files = files;
            callback(null);
        });
    },
    (callback) => {
        // Populate a submission with files
        submission.submitted_answer._files = [];
        fs.readdir(path.join(__dirname, 'directory'), (err, files) => {
            if (ERR(err, callback)) return;
            async.each(files, (file) => {
                fs.readFile(path.join(__dirname, directory, file), (err, contents) => {
                    if (ERR(err, callback)) return;
                    submission.submitted_answer._files.push({
                        name: file,
                        contents
                    });
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                return callback(null);
            });
        });
    },
    // Create a temporary folder to hold files in while we generate a tarball
    (callback) => {
        tmp.dir({unsafeCleanup: true}, (err, path) => {
            if (ERR(err, path)) return;
            tempDirectory = path;
            callback(null);
        });
    },
    (callback) => {
        const submission =
        externalGraderCommon.buildDirectory(dir, submission, question, course, callback);
    },
    // Tear down all the buckets we created so as not to leave extra files
    // lying around
    (callback) => {
        logger.info('Deleting S3 bucket for jobs...');
        const params = {
            Bucket: jobsBucketName
        };
        S3.deleteBucket(params, callback);
    },
    (callback) => {
        logger.info('Deleting S3 bucket for results...');
        const params = {
            Bucket: resultsBucketName
        };
        S3.deleteBucket(params, callback);
    },
    (callback) => {
        logger.info('Deleting S3 bucket for archives...');
        const params = {
            Bucket: archivesBucketName
        };
        S3.deleteBucket(params, callback);
    }
], (err) => {
    if (ERR(err)) return logger.error(err);
});
