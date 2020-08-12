const AWS = require('aws-sdk');
const fs = require('fs-extra');
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

module.exports.uploadToS3 = async function (filePath, isDirectory, s3Path, localPath, callback) {
    const s3 = new AWS.S3();

    let body;
    if (isDirectory) {
        body = '';
        s3Path += s3Path.endsWith('/') ? '' : '/';
    } else {
        try {
            body = await fs.promises.readFile(filePath);
        } catch (err) {
            callback(null, [filePath, s3Path, err]);
            return;
        }
    }
    var uploadParams = {
        Bucket: config.workspaceS3Bucket,
        Key: s3Path,
        Body: body,
    };
    s3.upload(uploadParams, function (err, _data) {
        if (err) {
            callback(null, [filePath, s3Path, err]);
            return;
        }
        logger.info(`Uploaded s3://${config.workspaceS3Bucket}/${s3Path} (${localPath})`);
        callback(null, 'OK');
    });
};

module.exports.deleteFromS3 = async function (filePath, isDirectory, s3Path, localPath, callback) {
    const s3 = new AWS.S3();

    if (isDirectory) {
        s3Path += s3Path.endsWith('/') ? '' : '/';
    }
    var deleteParams = {
        Bucket: config.workspaceS3Bucket,
        Key: s3Path,
    };
    s3.deleteObject(deleteParams, function(err, _data) {
        if (err) {
            callback(null, [filePath, s3Path, err]);
            return;
        }
        logger.info(`Deleted s3://${config.workspaceS3Bucket}/${s3Path} (${localPath})`);
        callback(null, 'OK');
    });
};
