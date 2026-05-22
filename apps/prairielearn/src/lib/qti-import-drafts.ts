import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';

// The file-store bucket lifecycle policy must expire this prefix after 24 hours.
// Successful imports still delete their draft immediately; lifecycle handles abandoned S3 drafts.
const DRAFT_KEY_PREFIX = 'qti-import-drafts/';

const DraftIdSchema = z.string().uuid();

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
  return `${DRAFT_KEY_PREFIX}${DraftIdSchema.parse(draftId)}.json`;
}

function draftPath(draftId: string) {
  return path.join(config.filesRoot, draftKey(draftId));
}

async function writeDraft(draftId: string, contents: Buffer) {
  if (config.fileStoreS3Bucket !== null) {
    await uploadToS3(config.fileStoreS3Bucket, draftKey(draftId), null, false, contents);
    return;
  }

  const filename = draftPath(draftId);
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await fs.writeFile(filename, contents, { mode: 0o600 });
}

async function readDraft(draftId: string) {
  if (config.fileStoreS3Bucket !== null) {
    return await getFromS3(config.fileStoreS3Bucket, draftKey(draftId), true);
  }

  return await fs.readFile(draftPath(draftId));
}

async function deleteDraft(draftId: string) {
  if (config.fileStoreS3Bucket !== null) {
    await deleteFromS3(config.fileStoreS3Bucket, draftKey(draftId));
    return;
  }

  await fs.rm(draftPath(draftId), { force: true });
}

export async function createQtiImportDraft(data: CreateQtiImportDraftData): Promise<string> {
  const draftId = crypto.randomUUID();
  await writeDraft(draftId, Buffer.from(JSON.stringify(data), 'utf8'));
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
  const buffer = await readDraft(draftId);
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
  await deleteDraft(draftId);
}
