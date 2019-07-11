/**
 * Runs a load test on our external grading infrastructure.
 */
const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const AWS = require('aws-sdk');
const SHA256 = require('crypto-js/sha256');
const _ = require('lodash');

const logger = require('../../lib/logger');
const ExternalGraderECS = require('../../lib/externalGraderECS');

const COUNT = 100;

if (fs.existsSync('./aws-config.json')) {
    logger.info('Loading AWS credentials...');
    AWS.config.loadFromPath('./aws-config.json');
} else {
    logger.info('Missing \'aws-config.json\' in project root!');
    process.exit(1);
}

var S3 = new AWS.S3();
const bucketBaseName = SHA256(new Date().toString()).toString().slice(0, 40);
const jobsBucketName = `${bucketBaseName}.jobs`;
const resultsBucketName = `${bucketBaseName}.results`;
const archivesBucketName = `${bucketBaseName}.archives`;

const submission = {};
const question = {};
const course = {};

async.series([
    // Let's create some dedicated S3 buckets for the load test
    (callback) => {
        logger.info(`Creating S3 bucket for jobs (${jobsBucketName})...`);
        const params = {
            Bucket: jobsBucketName,
        };
        S3.createBucket(params, callback);
    },
    (callback) => {
        logger.info(`Creating S3 bucket for results (${resultsBucketName})...`);
        const params = {
            Bucket: resultsBucketName,
        };
        S3.createBucket(params, callback);
    },
    (callback) => {
        logger.info(`Creating S3 bucket for archives (${archivesBucketName})...`);
        const params = {
            Bucket: archivesBucketName,
        };
        S3.createBucket(params, callback);
    },
    (callback) => {
        course.path = path.join(__dirname, '..', '..', 'exampleCourse');

        question.external_grading_files = ['python_autograder/'];
        question.external_grading_entrypoint = '/grade/shared/python_autograder/run.sh';
        question.external_grading_image = 'prairielearn/centos7-python';
        question.directory = 'fibonacciEditor';
        callback(null);
    },
    (callback) => {
        // Populate a submission with files
        submission.submitted_answer = {
            _files: [],
        };
        fs.readFile(path.join(__dirname, 'fib.py'), (err, contents) => {
            if (ERR(err, callback)) return;
            submission.submitted_answer._files.push({
                name: 'fib.py',
                contents: Buffer.from(contents).toString('base64'),
            });
            callback(null);
        });
    },
    // Now we just submit a lot of copies of this job!
    (callback) => {
        const grader = new ExternalGraderECS();
        const configOverrides = {
            externalGradingJobsS3Bucket: jobsBucketName,
            externalGradingResultsS3Bucket: resultsBucketName,
            externalGradingArchivesS3Bucket: archivesBucketName,
        };
        async.times(COUNT, (n, next) => {
            const gradingJob = {
                id: n,
            };
            const request = grader.handleGradingRequest(gradingJob, submission, null, question, course, configOverrides);
            request.on('submit', () => {
                logger.info(`Submitted job ${n}`);
                return next(null);
            });
            request.on('error', (err) => {
                logger.error(`Error submitting job ${n}!`);
                logger.error(err);
                return next(err);
            });
        }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    // This is terrible, but let's just poll for results on S3
    (callback) => {
        const results = [];
        for (let i = 0; i < COUNT; i++) {
            results.push(undefined);
        }
        function pollForResults() {
            const needResults = _.reduce(results, (accumulator, value, index) => {
                if (value === undefined) {
                    accumulator.push(index);
                }
                return accumulator;
            }, []);

            logger.info(`Waiting for results for ${needResults.length} jobs`);

            async.each(needResults, (job, done) => {
                const params = {
                    Bucket: resultsBucketName,
                    Key: `job_${job}.json`,
                    ResponseContentType: 'application/json',
                };
                new AWS.S3().getObject(params, (err, data) => {
                    if (err && err.code == 'NoSuchKey') {
                        return done(null);
                    }
                    if (ERR(err, done)) return;
                    results[job] = data;
                    done(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;

                // Check if we're still waiting for results from anything
                const needResults = _.reduce(results, (accumulator, value, index) => {
                    if (value === undefined) {
                        accumulator.push(index);
                    }
                    return accumulator;
                }, []);

                if (needResults.length == 0) {
                    return callback(null);
                } else {
                    setTimeout(pollForResults, 5000);
                }
            });
        }
        pollForResults();
    },

], (err) => {
    ERR(err, (err) => logger.error(err));

    async.series([
        // Tear down all the buckets we created so as not to leave extra files
        // lying around
        (callback) => {
            logger.info('Deleting S3 bucket for jobs...');
            const params = {
                Bucket: jobsBucketName,
            };
            S3.deleteBucket(params, callback);
        },
        (callback) => {
            logger.info('Deleting S3 bucket for results...');
            const params = {
                Bucket: resultsBucketName,
            };
            S3.deleteBucket(params, callback);
        },
        (callback) => {
            logger.info('Deleting S3 bucket for archives...');
            const params = {
                Bucket: archivesBucketName,
            };
            S3.deleteBucket(params, callback);
        },
    ]);
});
