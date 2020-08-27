const AWS = require('aws-sdk');
const fs = require('fs-extra');
const util = require('util');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const config = require('./config');

module.exports.init = function(callback) {
    // AWS will look relative to the Node working directory, not the current
    // directory. So aws-config.json should be in the project root.
    //
    // If it exists, load it. If it does not exist, then we are either (1)
    // running locally, and so probably don't care, or (2) running on prod,
    // and so AWS will have already been configured.
    if (fs.existsSync('./aws-config.json')) {
        logger.info('Loading AWS credentials for external grading and workspace S3 resources');
        AWS.config.loadFromPath('./aws-config.json');
    }

    // It is important that we always do this:
    // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-region.html
    AWS.config.update({region: config.awsRegion});

    config.awsServiceGlobalOptions = {};
    if (process.env.AWS_ENDPOINT) {
        config.awsServiceGlobalOptions.endpoint = new AWS.Endpoint(process.env.AWS_ENDPOINT);
    }

    callback(null);
};

module.exports.getS3RVERConfiguration = function() {
    return new AWS.Config({
        s3ForcePathStyle: true,
        accessKeyId: 'S3RVER',
        secretAccessKey: 'S3RVER',
        endpoint: new AWS.Endpoint('http://localhost:5000'),
    });
};

/**
 * Upload a local file or directory to S3.
 * 
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 destination path.
 * @param {string} localPath - The local source path.
 * @param {boolean=} isDirectory - Whether the upload source is a directory (defaults to false).
 */
module.exports.uploadToS3Async = async function (s3Bucket, s3Path, localPath, isDirectory=false) {
    const s3 = new AWS.S3();

    let body;
    if (isDirectory) {
        body = '';
        s3Path += s3Path.endsWith('/') ? '' : '/';
    } else {
        try {
            body = await fs.promises.readFile(localPath);
        } catch(err) {
            return [localPath, s3Path, err];
        }
    }

    const params = {
        Bucket: s3Bucket,
        Key: s3Path,
        Body: body,
    };
    await s3.upload(params).promise();
    debug(`Uploaded ${localPath} to s3://${s3Bucket}/${s3Path}`);
};
module.exports.uploadToS3 = util.callbackify(this.uploadToS3Async);

/**
 * Delete a file or directory from S3.
 * 
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 target path.
 * @param {boolean=} isDirectory - Whether the deletion target is a directory (defaults to false).
 */
module.exports.deleteFromS3Async = async function (s3Bucket, s3Path, isDirectory=false) {
    const s3 = new AWS.S3();

    if (isDirectory) {
        s3Path += s3Path.endsWith('/') ? '' : '/';
    }

    const params = {
        Bucket: s3Bucket,
        Key: s3Path,
    };
    await s3.deleteObject(params).promise();
    debug(`Deleted s3://${s3Bucket}/${s3Path}`);
};
module.exports.deleteFromS3 = util.callbackify(this.deleteFromS3Async);
