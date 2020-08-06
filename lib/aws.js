const AWS = require('aws-sdk');
const fs = require('fs-extra');
const logger = require('./logger');
const config = require('./config');
const request = require('request');

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

module.exports.isOnEC2 = function(callback) {
    /* Try to connect to the AWS Metadata service, if we get a host not found then
       we are very likely to be running on EC2 */
    request(`http://${AWS.MetadataService.host}`, (err, _response, _body) => {
        callback(null, !err);
    });
};

module.exports.getS3RVERConfiguration = function() {
    return new AWS.Config({
        s3ForcePathStyle: true,
        accessKeyId: 'S3RVER',
        secretAccessKey: 'S3RVER',
        endpoint: new AWS.Endpoint('http://localhost:5000'),
    });
};
