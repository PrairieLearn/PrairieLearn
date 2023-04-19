// @ts-check
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const util = require('util');
const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { logger } = require('@prairielearn/logger');
const { config } = require('./config');

// https://github.com/aws/aws-sdk-js/issues/4354#issuecomment-1450660391
require('aws-sdk/lib/maintenance_mode_message').suppress = true;

module.exports.init = async function () {
  // If we're not running in EC2, assume we're running with a local s3rver instance.
  // See https://github.com/jamhall/s3rver for more details.
  if (!config.runningInEc2) {
    logger.verbose('Using local s3rver AWS configuration');
    AWS.config.update({
      s3ForcePathStyle: true,
      accessKeyId: 'S3RVER',
      secretAccessKey: 'S3RVER',
      s3: {
        endpoint: new AWS.Endpoint('http://localhost:5000'),
      },
    });
  }

  // It is important that we always do this:
  // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-region.html
  AWS.config.update({ region: config.awsRegion });

  if (process.env.AWS_ENDPOINT) {
    config.awsServiceGlobalOptions.endpoint = new AWS.Endpoint(process.env.AWS_ENDPOINT);
  }
};

/**
 * Upload a local file or directory to S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 destination path.
 * @param {string} localPath - The local source path.
 * @param {boolean=} isDirectory - Whether the upload source is a directory (defaults to false).
 * @param {Buffer | null} buffer - A file buffer if local source path falsy.
 */
module.exports.uploadToS3Async = async function (
  s3Bucket,
  s3Path,
  localPath,
  isDirectory = false,
  buffer = null
) {
  const s3 = new AWS.S3();

  let body;
  if (isDirectory) {
    body = '';
    s3Path += s3Path.endsWith('/') ? '' : '/';
  } else {
    if (localPath) {
      body = await fs.promises.readFile(localPath);
    } else if (buffer) {
      body = buffer;
    } else {
      throw new Error('must specify localPath or buffer');
    }
  }

  const params = {
    Bucket: s3Bucket,
    Key: s3Path,
    Body: body,
  };
  const res = await s3.upload(params).promise();
  if (localPath) {
    logger.verbose(`Uploaded localPath=${localPath} to s3://${s3Bucket}/${s3Path}`);
  } else {
    logger.verbose(`Uploaded buffer to s3://${s3Bucket}/${s3Path}`);
  }
  return res;
};
module.exports.uploadToS3 = util.callbackify(module.exports.uploadToS3Async);

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
module.exports.uploadDirectoryToS3Async = async function (
  s3Bucket,
  s3Path,
  localPath,
  ignoreList = []
) {
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
          logger.verbose(`Uploaded file ${localFilePath} to s3://${s3Bucket}/${s3FilePath}`);
        } catch (err) {
          logger.verbose(
            `Did not sync file ${localFilePath} to $s3://{s3Bucket}/${s3FilePath}: ${err}`
          );
        }
      } else if (stat.isDirectory()) {
        const s3DirPath = s3FilePath.endsWith('/') ? s3FilePath : `${s3FilePath}/`;
        try {
          await s3
            .putObject({
              Bucket: s3Bucket,
              Key: s3DirPath,
              Body: '',
            })
            .promise();
          logger.verbose(`Uploaded directory ${localFilePath} to s3://${s3Bucket}/${s3DirPath}`);
        } catch (err) {
          logger.verbose(
            `Did not sync directory ${localFilePath} to $s3://{s3Bucket}/${s3DirPath}: ${err}`
          );
        }
        await walkDirectory(relFilePath);
      }
    });
  }

  await walkDirectory('');
};
module.exports.uploadDirectoryToS3 = util.callbackify(module.exports.uploadDirectoryToS3Async);

/**
 * Download a file or directory from S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 source path.
 * @param {string} localPath - The local target path.
 * @param {object?} options - Optional parameters, including owner and group (optional, defaults to {}).
 */
module.exports.downloadFromS3Async = async function (s3Bucket, s3Path, localPath, options = {}) {
  if (localPath.endsWith('/')) {
    debug(`downloadFromS3: bypassing S3 and creating directory localPath=${localPath}`);
    await fs.promises.mkdir(localPath, { recursive: true });
    if (options.owner != null && options.group != null) {
      await fs.promises.chown(localPath, options.owner, options.group);
    }
    return;
  }

  debug(`downloadFromS3: creating containing directory for file localPath=${localPath}`);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  if (options.owner != null && options.group != null) {
    await fs.promises.chown(path.dirname(localPath), options.owner, options.group);
  }

  const s3 = new AWS.S3();
  const params = {
    Bucket: s3Bucket,
    Key: s3Path,
  };
  const s3Stream = s3.getObject(params).createReadStream();
  const fileStream = fs.createWriteStream(localPath);

  return new Promise((resolve, reject) => {
    s3Stream.on('error', function (err) {
      debug(`downloadFromS3: missing s3://${s3Bucket}/${s3Path}`);
      reject(err);
    });
    s3Stream
      .pipe(fileStream)
      .on('error', function (err) {
        debug(`downloadFromS3: connection lost`);
        reject(err);
      })
      .on('close', function () {
        if (options.owner != null && options.group != null) {
          fs.chown(localPath, options.owner, options.group, (err) => {
            if (err) return reject(err);
            resolve(null);
          });
        }
      });
  });
};
module.exports.downloadFromS3 = util.callbackify(module.exports.downloadFromS3Async);

/**
 * Delete a file or directory from S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 target path.
 * @param {boolean=} isDirectory - Whether the deletion target is a directory (defaults to false).
 */
module.exports.deleteFromS3Async = async function (s3Bucket, s3Path, isDirectory = false) {
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

/**
 * Get a file from S3.
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - The S3 target path.
 * @param {boolean} buffer - Defaults to true to return buffer.
 * @return {Promise<AWS.S3.Body>} Buffer or ReadableStream type from S3 file contents.
 */
module.exports.getFromS3Async = async function (bucket, key, buffer = true) {
  const s3 = new AWS.S3();
  if (buffer) {
    const res = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    logger.verbose(`Fetched data from s3://${bucket}/${key}`);
    if (!res.Body) throw new Error('No data returned from S3');
    return res.Body;
  } else {
    return s3.getObject({ Bucket: bucket, Key: key }).createReadStream();
  }
};

module.exports.deleteFromS3 = util.callbackify(module.exports.deleteFromS3Async);
