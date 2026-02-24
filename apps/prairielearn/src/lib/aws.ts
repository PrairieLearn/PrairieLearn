import { type IncomingMessage } from 'node:http';
import { pipeline } from 'node:stream/promises';
import * as path from 'path';

import { type CompleteMultipartUploadCommandOutput, S3 } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { Upload } from '@aws-sdk/lib-storage';
import { type NodeJsClient, type SdkStream } from '@smithy/types';
import debugfn from 'debug';
import fs from 'fs-extra';

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
        endpoint: 'http://127.0.0.1:5000',
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
 * @param s3Bucket - The S3 bucket name.
 * @param s3Path - The S3 destination path.
 * @param localPath - The local source path.
 * @param isDirectory - Whether the upload source is a directory (defaults to false).
 * @param buffer - A file buffer if local source path falsy.
 */
export async function uploadToS3(
  s3Bucket: string,
  s3Path: string,
  localPath: string | null,
  isDirectory = false,
  buffer: Buffer | null = null,
): Promise<CompleteMultipartUploadCommandOutput> {
  const s3 = new S3(makeS3ClientConfig());

  let body: fs.ReadStream | string | Buffer;
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
 * @param s3Bucket - The S3 bucket name.
 * @param s3Path - The S3 source path.
 * @param localPath - The local target path.
 */
export async function downloadFromS3(s3Bucket: string, s3Path: string, localPath: string) {
  if (localPath.endsWith('/')) {
    debug(`downloadFromS3: bypassing S3 and creating directory localPath=${localPath}`);
    await fs.promises.mkdir(localPath, { recursive: true });
    return;
  }

  debug(`downloadFromS3: creating containing directory for file localPath=${localPath}`);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

  const s3 = new S3(makeS3ClientConfig()) as NodeJsClient<S3>;
  const res = await s3.getObject({
    Bucket: s3Bucket,
    Key: s3Path,
  });
  if (res.Body === undefined) {
    throw new Error('No data returned from S3');
  }
  const s3Stream = res.Body;
  const fileStream = fs.createWriteStream(localPath);

  await pipeline(s3Stream, fileStream);
}

/**
 * Delete a file or directory from S3.
 *
 * @knipignore
 * @param s3Bucket - The S3 bucket name.
 * @param s3Path - The S3 target path.
 * @param isDirectory - Whether the deletion target is a directory (defaults to false).
 */
export async function deleteFromS3(s3Bucket: string, s3Path: string, isDirectory = false) {
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

export async function getFromS3(bucket: string, key: string, buffer: true): Promise<Buffer>;
export async function getFromS3(
  bucket: string,
  key: string,
  buffer: false,
): Promise<SdkStream<IncomingMessage>>;
/**
 * Get a file from S3.
 *
 * @param bucket - S3 bucket name.
 * @param key - The S3 target path.
 * @param buffer - Defaults to true to return buffer.
 * @returns Buffer or ReadableStream type from S3 file contents.
 */
export async function getFromS3(
  bucket: string,
  key: string,
  buffer = true,
): Promise<Buffer | SdkStream<IncomingMessage>> {
  const s3 = new S3(makeS3ClientConfig()) as NodeJsClient<S3>;
  const res = await s3.getObject({ Bucket: bucket, Key: key });
  if (!res.Body) throw new Error('No data returned from S3');
  logger.verbose(`Fetched data from s3://${bucket}/${key}`);

  if (buffer) {
    return Buffer.from(await res.Body.transformToByteArray());
  } else {
    return res.Body;
  }
}
