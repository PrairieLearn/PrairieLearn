import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  type SecretKey,
  generateSignedToken,
  getCheckedSignedTokenData,
} from '@prairielearn/signed-token';

import type { DocxSource } from './docx-browser.js';

const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SnapshotIdSchema = z.strictObject({
  printFormId: z.string(),
  authnUserId: z.string(),
  search: z.string(),
  questionListDigest: z.string(),
  htmlDigest: z.string(),
  sourceDigest: z.string(),
});

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Digests HTML serialized by `serializePrintDocument` in the server's browser. */
export function digestPrintHtml(html: string): string {
  return digest(html);
}

function normalizedSearch(search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  params.set('document', params.get('document') ?? 'assessment');
  params.sort();
  return params.toString();
}

export function createPrintSnapshotId(
  {
    printFormId,
    authnUserId,
    search,
    questionListDigest,
    html,
    source,
  }: {
    printFormId: string;
    authnUserId: string;
    search: URLSearchParams;
    questionListDigest: string;
    html: string;
    source: DocxSource;
  },
  secretKey: SecretKey,
): string {
  return generateSignedToken(
    {
      printFormId,
      authnUserId,
      search: normalizedSearch(search),
      questionListDigest,
      htmlDigest: digestPrintHtml(html),
      sourceDigest: digest(JSON.stringify(source)),
    },
    secretKey,
  );
}

/**
 * Returns the signed HTML digest if the ID matches this form, user, layout, and
 * question list, or null. Export workers compare the digest after the browser has
 * normalized the submitted HTML.
 */
export function checkPrintSnapshotId(
  {
    id,
    printFormId,
    authnUserId,
    search,
    questionListDigest,
    source,
  }: {
    id: string;
    printFormId: string;
    authnUserId: string;
    search: URLSearchParams;
    questionListDigest: string;
    source?: DocxSource;
  },
  secretKey: SecretKey,
): string | null {
  const result = SnapshotIdSchema.safeParse(
    getCheckedSignedTokenData(id, secretKey, { maxAge: SNAPSHOT_MAX_AGE_MS }),
  );
  if (!result.success) return null;
  const snapshot = result.data;
  const matches =
    snapshot.printFormId === printFormId &&
    snapshot.authnUserId === authnUserId &&
    snapshot.search === normalizedSearch(search) &&
    snapshot.questionListDigest === questionListDigest &&
    (source === undefined || snapshot.sourceDigest === digest(JSON.stringify(source)));
  return matches ? snapshot.htmlDigest : null;
}
