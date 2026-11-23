import { createHash } from 'node:crypto';

import { NoSuchKey } from '@aws-sdk/client-s3';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { getFromS3, uploadToS3 } from '../aws.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../client/printing/print-snapshot.js';
import type { PrintForm } from '../db-types.js';
import { getFileStoreS3Bucket } from '../file-store.js';

import { DocxSourceSchema } from './docx-source-schema.js';
import { PrintableCoverSchema } from './printable-cover.js';

import type { PrintDocument } from './index.js';

const KEY_PREFIX = 'print-exports/snapshots/';
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PrintSnapshotContentSchema = z.object({
  html: z.string(),
  docx: z.object({
    source: DocxSourceSchema,
    cover: PrintableCoverSchema.optional(),
    footer: z.object({ left: z.string(), center: z.string(), right: z.string() }),
  }),
});
export type PrintSnapshotContent = z.infer<typeof PrintSnapshotContentSchema>;

const PrintSnapshotSummarySchema = z.object({
  createdAt: z.number(),
  questionCount: z.number(),
  omittedQuestionCount: z.number(),
  pageCount: z.number(),
});
export type PrintSnapshotSummary = z.infer<typeof PrintSnapshotSummarySchema>;

/**
 * Everything a preview depends on besides question content. Exports recompute it from the
 * authorized form, the requesting user, and the saved settings, so a snapshot is only found
 * for the same user and an unchanged form.
 */
export interface PrintSnapshotIdentity {
  /** The creation time keeps keys unique if form IDs repeat, e.g. after a database reset. */
  printForm: Pick<PrintForm, 'id' | 'created_at'>;
  document: PrintDocument;
  authnUserId: string;
  userId: string;
  layout: string;
  questionListDigest: string;
}

/** Normalizes a preview's layout query so the preview and exports derive the same key. */
export function printSnapshotLayout(search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  params.delete('document');
  params.sort();
  return params.toString();
}

export function printSnapshotKey(identity: PrintSnapshotIdentity): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        identity.printForm.id,
        identity.printForm.created_at.toISOString(),
        identity.document,
        identity.authnUserId,
        identity.userId,
        identity.layout,
        identity.questionListDigest,
      ]),
    )
    .digest('hex');
  return `${KEY_PREFIX}${hash}`;
}

async function getOptionalFromS3(key: string): Promise<Buffer | null> {
  try {
    return await getFromS3(getFileStoreS3Bucket(), key, true);
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

/** Saves a rendered preview so exports can use it without the browser sending it back. */
export async function storePrintSnapshot(
  identity: PrintSnapshotIdentity,
  content: PrintSnapshotContent,
  summary: Omit<PrintSnapshotSummary, 'createdAt'>,
): Promise<void> {
  const bucket = getFileStoreS3Bucket();
  const key = printSnapshotKey(identity);
  // Write the summary last: handlers only look for content once they've found a summary.
  await uploadToS3(bucket, `${key}.json`, null, false, Buffer.from(JSON.stringify(content)));
  await uploadToS3(
    bucket,
    `${key}.summary.json`,
    null,
    false,
    Buffer.from(JSON.stringify({ ...summary, createdAt: Date.now() })),
  );
}

/** Returns the latest preview for this identity, or null if there is none from the last day. */
export async function selectOptionalPrintSnapshotSummary(
  identity: PrintSnapshotIdentity,
): Promise<{ key: string; summary: PrintSnapshotSummary } | null> {
  const key = printSnapshotKey(identity);
  const data = await getOptionalFromS3(`${key}.summary.json`);
  if (!data) return null;
  const summary = PrintSnapshotSummarySchema.parse(JSON.parse(data.toString('utf8')));
  if (Date.now() - summary.createdAt > SNAPSHOT_MAX_AGE_MS) return null;
  return { key, summary };
}

export async function readPrintSnapshot(key: string): Promise<PrintSnapshotContent> {
  const data = await getOptionalFromS3(`${key}.json`);
  if (!data) throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
  return PrintSnapshotContentSchema.parse(JSON.parse(data.toString('utf8')));
}
