import crypto from 'node:crypto';

import { z } from 'zod';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';

// The file-store bucket lifecycle policy must expire this prefix after 24 hours.
const DRAFT_KEY_PREFIX = 'qti-import-drafts/';

const QtiImportDraftDataSchema = z.object({
  courseId: z.string(),
  courseInstanceId: z.string(),
  userId: z.string(),
  results: z.array(z.unknown()),
});

type QtiImportDraftData = z.infer<typeof QtiImportDraftDataSchema>;

interface CreateQtiImportDraftData {
  courseId: string;
  courseInstanceId: string;
  userId: string;
  results: unknown[];
}

function draftKey(draftId: string) {
  return `${DRAFT_KEY_PREFIX}${draftId}.json`;
}

export async function createQtiImportDraft(data: CreateQtiImportDraftData): Promise<string> {
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

export async function readQtiImportDraft({
  draftId,
  courseId,
  courseInstanceId,
  userId,
}: {
  draftId: string;
  courseId: string;
  courseInstanceId: string;
  userId: string;
}): Promise<QtiImportDraftData> {
  const buffer = await getFromS3(config.fileStoreS3Bucket, draftKey(draftId), true);
  const data = QtiImportDraftDataSchema.parse(JSON.parse(buffer.toString('utf8')));
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
