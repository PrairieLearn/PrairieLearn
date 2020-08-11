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

module.exports.uploadToS3 = async function (filePath, isDirectory, bucket, S3FilePath, localPath, callback) {
    const s3 = new AWS.S3();

    let body;
    if (isDirectory) {
        body = '';
        S3FilePath += '/';
    } else {
        try {
            body = await fs.promises.readFile(filePath);
        } catch (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
    }
    const params = {
        Bucket: bucket,
        Key: S3FilePath,
        Body: body,
    };
    s3.upload(params, (err, _result) => {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        logger.info(`Uploaded ${localPath} to S3`);
        callback(null, 'OK');
    });
};

module.exports.deleteFromS3 = async function (filePath, isDirectory, bucket, S3FilePath, localPath, callback) {
    const s3 = new AWS.S3();

    if (isDirectory) {
        S3FilePath += '/';
    }
    const params = {
        Bucket: bucket,
        Key: S3FilePath,
    };
    s3.deleteObject(params, function(err, _result) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        logger.info(`Deleted ${S3FilePath} from S3`);
        callback(null, 'OK');
    });
};
