// @ts-check
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import * as path from 'path';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import debugfn from 'debug';
import { pipeline } from 'node:stream/promises';
import { makeAwsConfigProvider } from '@prairielearn/aws';

import { logger } from '@prairielearn/logger';
import { config } from './config.js';

const debug = debugfn('prairielearn:aws');

const awsConfigProvider = makeAwsConfigProvider({
  credentials: fromNodeProviderChain(),
  getClientConfig: () => ({
    region: config.awsRegion,
    ...config.awsServiceGlobalOptions,
  }),
  getS3ClientConfig: () => {
    if (!config.runningInEc2) {
      // If we're not running in EC2, assume we're running with a local s3rver instance.
      // See https://github.com/jamhall/s3rver for more details.
      return {
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'S3RVER',
          secretAccessKey: 'S3RVER',
        },
        endpoint: 'http://localhost:5000',
      };
    }

    return {};
  },
});

export const makeS3ClientConfig = awsConfigProvider.makeS3ClientConfig;

export const makeAwsClientConfig = awsConfigProvider.makeAwsClientConfig;

/**
 * Upload a local file or directory to S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 destination path.
 * @param {string | null} localPath - The local source path.
 * @param {boolean=} isDirectory - Whether the upload source is a directory (defaults to false).
 * @param {Buffer | null} buffer - A file buffer if local source path falsy.
 * @returns {Promise<import('@aws-sdk/client-s3').CompleteMultipartUploadCommandOutput>}
 */
export async function uploadToS3(s3Bucket, s3Path, localPath, isDirectory = false, buffer = null) {
  const s3 = new S3(makeS3ClientConfig());

  let body;
  if (isDirectory) {
    body = '';
    s3Path += s3Path.endsWith('/') ? '' : '/';
  } else {
    if (localPath) {
      body = fs.createReadStream(localPath);
    } else if (buffer) {
      body = buffer;
    } else {
      throw new Error('must specify localPath or buffer');
    }
  }

  const res = await new Upload({
    client: s3,
    params: {
      Bucket: s3Bucket,
      Key: s3Path,
      Body: body,
    },
  }).done();
  if (localPath) {
    logger.verbose(`Uploaded localPath=${localPath} to s3://${s3Bucket}/${s3Path}`);
  } else {
    logger.verbose(`Uploaded buffer to s3://${s3Bucket}/${s3Path}`);
  }
  return res;
}

/**
 * Download a file or directory from S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 source path.
 * @param {string} localPath - The local target path.
 * @param {object?} options - Optional parameters, including owner and group (optional, defaults to {}).
 */
export async function downloadFromS3(s3Bucket, s3Path, localPath, options = {}) {
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

  const s3 = new S3(makeS3ClientConfig());
  const res = await s3.getObject({
    Bucket: s3Bucket,
    Key: s3Path,
  });
  const s3Stream = /** @type {import('stream').Readable} */ (res.Body);
  const fileStream = fs.createWriteStream(localPath);

  await pipeline(s3Stream, fileStream);

  if (options.owner != null && options.group != null) {
    await fs.chown(localPath, options.owner, options.group);
  }
}

/**
 * Delete a file or directory from S3.
 *
 * @param {string} s3Bucket - The S3 bucket name.
 * @param {string} s3Path - The S3 target path.
 * @param {boolean=} isDirectory - Whether the deletion target is a directory (defaults to false).
 */
export async function deleteFromS3(s3Bucket, s3Path, isDirectory = false) {
  const s3 = new S3(makeS3ClientConfig());

  if (isDirectory) {
    s3Path += s3Path.endsWith('/') ? '' : '/';
  }
  await s3.deleteObject({
    Bucket: s3Bucket,
    Key: s3Path,
  });
  debug(`Deleted s3://${s3Bucket}/${s3Path}`);
}

/**
 * Get a file from S3.
 *
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - The S3 target path.
 * @param {boolean} buffer - Defaults to true to return buffer.
 * @return {Promise<Buffer | import('@aws-sdk/client-s3').GetObjectOutput['Body']>} Buffer or ReadableStream type from S3 file contents.
 */
export async function getFromS3(bucket, key, buffer = true) {
  const s3 = new S3(makeS3ClientConfig());
  const res = await s3.getObject({ Bucket: bucket, Key: key });
  if (!res.Body) throw new Error('No data returned from S3');
  logger.verbose(`Fetched data from s3://${bucket}/${key}`);

  if (buffer) {
    return Buffer.from(await res.Body.transformToByteArray());
  } else {
    return res.Body;
  }
}
