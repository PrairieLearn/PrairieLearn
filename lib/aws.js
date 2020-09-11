// FIXME: we should be able to do @ts-check here, but something is weird with the s3 endpoint
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const util = require('util');
const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const config = require('./config');

module.exports.init = function(callback) {
    // If we are runningInEc2, then we are running on prod,
    // and so AWS will have already been configured.
    if (!config.runningInEc2) {
        const configFile = path.join(process.cwd(), 'aws-config.json');
        if (fs.existsSync(configFile)) {
            logger.info(`Loading AWS configuration from ${configFile}`);
            AWS.config.loadFromPath(configFile);
        } else {
            logger.info('Using local s3rver AWS configuration');
            AWS.config = module.exports.getS3RVERConfiguration();
        }
    }

    // It is important that we always do this:
    // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-region.html
    AWS.config.update({region: config.awsRegion});

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
    logger.info(`Uploaded ${localPath} to s3://${s3Bucket}/${s3Path}`);
};
module.exports.uploadToS3 = util.callbackify(this.uploadToS3Async);

/**
 * Recursively upload a directory to a path in S3, including empty
 * subfolders. The file `${localPath}/filename` will be uploaded
 * to `${s3Bucket}/${s3Path}/filename`.
 *
 * @param {string} s3Bucket Remote S3 bucket to upload into.
 * @param {string} s3Path Remote S3 path to upload into.
 * @param {string} localPath Local path to upload.
 * @param {string[]} ignoreList List of files to ignore. These should be paths relative to localPath.
 */
module.exports.uploadDirectoryToS3Async = async function(s3Bucket, s3Path, localPath, ignoreList=[]) {
    const s3 = new AWS.S3();
    const ignoreSet = new Set(ignoreList);

    async function walkDirectory(subDir) {
        const localFullDir = path.join(localPath, subDir);
        const files = await fs.readdir(localFullDir);
        await async.each(files, async (file) => {
            const localFilePath = path.join(localPath, subDir, file);
            const s3FilePath = path.join(s3Path, subDir, file);
            const relFilePath = path.join(subDir, file);

            if (ignoreSet.has(relFilePath)) return;

            const stat = await fs.stat(localFilePath);
            if (stat.isFile()) {
                const fileBody = await fs.readFile(localFilePath);
                try {
                    const params = {
                        Bucket: s3Bucket,
                        Key: s3FilePath,
                        Body: fileBody,
                    };
                    await s3.upload(params).promise();
                    logger.info(`Uploaded file ${localFilePath} to s3://${s3Bucket}/${s3FilePath}`);
                } catch (err) {
                    logger.error(`Error syncing file ${localFilePath} to $s3://{s3Bucket}/${s3FilePath}: ${err}`);
                }
            } else if (stat.isDirectory()) {
                const s3DirPath = s3FilePath.endsWith('/') ? s3FilePath : `${s3FilePath}/`;
                try {
                    await s3.putObject({
                        Bucket: s3Bucket,
                        Key: s3DirPath,
                        Body: '',
                    }).promise();
                    logger.info(`Uploaded directory ${localFilePath} to s3://${s3Bucket}/${s3DirPath}`);
                } catch (err) {
                    logger.error(`Error syncing directory ${localFilePath} to $s3://{s3Bucket}/${s3DirPath}: ${err}`);
                }
                await walkDirectory(relFilePath);
            }
        });
    }

    await walkDirectory('');
};
module.exports.uploadDirectoryToS3 = util.callbackify(this.uploadDirectoryToS3Async);

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
