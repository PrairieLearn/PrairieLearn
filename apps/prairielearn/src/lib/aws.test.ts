import { randomUUID } from 'node:crypto';

import { S3 } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { deleteFromS3, getFromS3, makeS3ClientConfig, uploadToS3 } from './aws.js';

describe('local S3 storage', () => {
  it('provisions the buckets used by PrairieLearn', async () => {
    const s3 = new S3(makeS3ClientConfig());
    const buckets = (await s3.listBuckets()).Buckets?.map((bucket) => bucket.Name);
    expect(buckets).toEqual(
      expect.arrayContaining(['workspaces', 'chunks', 'file-store', 'workspace-logs']),
    );
  });

  it('uploads, reads, and deletes multipart objects', async () => {
    const bucket = 'file-store';
    const key = `rustfs-test/${randomUUID()}`;
    const contents = Buffer.alloc(6 * 1024 * 1024, 'x');
    try {
      await uploadToS3(bucket, key, null, false, contents);
      expect((await getFromS3(bucket, key, true)).equals(contents)).toBe(true);
    } finally {
      await deleteFromS3(bucket, key);
    }

    const s3 = new S3(makeS3ClientConfig());
    await expect(s3.headObject({ Bucket: bucket, Key: key })).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
  }, 60_000);
});
