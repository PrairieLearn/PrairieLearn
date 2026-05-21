import crypto from 'node:crypto';

import { S3 } from '@aws-sdk/client-s3';

import { deleteFromS3, getFromS3, makeS3ClientConfig, uploadToS3 } from './aws.js';
import { config } from './config.js';

const DRAFT_KEY_PREFIX = 'qti-import-drafts/';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface QtiImportDraftData<T> {
  courseId: string;
  courseInstanceId: string;
  userId: string;
  results: T[];
}

function draftKey(draftId: string) {
  return `${DRAFT_KEY_PREFIX}${draftId}.json`;
}

export async function createQtiImportDraft<T>(data: QtiImportDraftData<T>): Promise<string> {
  const draftId = crypto.randomUUID();
  await uploadToS3(
    config.fileStoreS3Bucket,
    draftKey(draftId),
    null,
    false,
    Buffer.from(JSON.stringify(data), 'utf8'),
  );
  return draftId;
}

export async function readQtiImportDraft<T>({
  draftId,
  courseId,
  courseInstanceId,
  userId,
}: {
  draftId: string;
  courseId: string;
  courseInstanceId: string;
  userId: string;
}): Promise<QtiImportDraftData<T>> {
  const buffer = await getFromS3(config.fileStoreS3Bucket, draftKey(draftId), true);
  const data = JSON.parse(buffer.toString('utf8')) as QtiImportDraftData<T>;
  if (
    data.courseId !== courseId ||
    data.courseInstanceId !== courseInstanceId ||
    data.userId !== userId
  ) {
    throw new Error('QTI import draft does not belong to this course instance or user');
  }
  return data;
}

export async function deleteQtiImportDraft(draftId: string): Promise<void> {
  await deleteFromS3(config.fileStoreS3Bucket, draftKey(draftId));
}

export async function cleanupOldQtiImportDrafts(): Promise<void> {
  const s3 = new S3(makeS3ClientConfig());
  const cutoff = Date.now() - DRAFT_MAX_AGE_MS;
  let continuationToken: string | undefined;

  do {
    const listed = await s3.listObjectsV2({
      Bucket: config.fileStoreS3Bucket,
      Prefix: DRAFT_KEY_PREFIX,
      ContinuationToken: continuationToken,
    });

    await Promise.all(
      (listed.Contents ?? []).map(async (object) => {
        if (!object.Key || !object.LastModified || object.LastModified.getTime() >= cutoff) {
          return;
        }

        await s3.deleteObject({
          Bucket: config.fileStoreS3Bucket,
          Key: object.Key,
        });
      }),
    );

    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
}
