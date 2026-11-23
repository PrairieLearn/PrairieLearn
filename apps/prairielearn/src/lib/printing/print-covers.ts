import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { generateSignedToken, getCheckedSignedTokenData } from '@prairielearn/signed-token';

import { getFromS3, uploadToS3 } from '../aws.js';
import { config } from '../config.js';
import { getFileStoreS3Bucket } from '../file-store.js';

import { PrintPacketError, assertPrintCoverTotals, readPrintCoverPages } from './print-packet.js';

const KEY_PREFIX = 'print-exports/covers/';
const COVER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const EXPIRED_COVER_MESSAGE =
  'The uploaded cover PDFs have expired. Remove them, upload them again, and try again.';

const PrintCoverTokenSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  pageCount: z.number(),
  sizeBytes: z.number(),
  assessmentId: z.string(),
  authnUserId: z.string(),
});
export type PrintCover = z.infer<typeof PrintCoverTokenSchema>;

interface PrintCoverOwner {
  assessmentId: string;
  authnUserId: string;
}

/**
 * Checks an uploaded cover once and stores it. The returned ID is signed, so exports can trust
 * its page count and size without reading the PDF again.
 */
export async function uploadPrintCover(file: File, owner: PrintCoverOwner) {
  const [cover] = await readPrintCoverPages([file]);
  const key = `${KEY_PREFIX}${randomUUID()}.pdf`;
  await uploadToS3(
    getFileStoreS3Bucket(),
    key,
    null,
    false,
    Buffer.from(await file.arrayBuffer()),
  );
  const pageCount = cover.getPageCount();
  return {
    id: generateSignedToken(
      { key, name: file.name, pageCount, sizeBytes: file.size, ...owner },
      config.secretKey,
    ),
    name: file.name,
    pageCount,
  };
}

/** Resolves cover IDs uploaded by this user for this assessment in the last day. */
export function checkPrintCovers(ids: string[], owner: PrintCoverOwner): PrintCover[] {
  const covers = ids.map((id) => {
    const cover = PrintCoverTokenSchema.safeParse(
      getCheckedSignedTokenData(id, config.secretKey, { maxAge: COVER_MAX_AGE_MS }),
    );
    if (
      !cover.success ||
      cover.data.assessmentId !== owner.assessmentId ||
      cover.data.authnUserId !== owner.authnUserId
    ) {
      throw new PrintPacketError(EXPIRED_COVER_MESSAGE);
    }
    return cover.data;
  });
  assertPrintCoverTotals({
    files: covers.length,
    bytes: covers.reduce((total, cover) => total + cover.sizeBytes, 0),
    pages: covers.reduce((total, cover) => total + cover.pageCount, 0),
  });
  return covers;
}

export async function readPrintCovers(
  covers: Pick<PrintCover, 'key' | 'name'>[],
  signal?: AbortSignal,
) {
  const files = await Promise.all(
    covers.map(
      async ({ key, name }) =>
        new File([new Uint8Array(await getFromS3(getFileStoreS3Bucket(), key, true))], name, {
          type: 'application/pdf',
        }),
    ),
  );
  return await readPrintCoverPages(files, signal);
}
