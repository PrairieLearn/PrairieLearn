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
  assessmentInstanceId: z.string(),
  authnUserId: z.string(),
  search: z.string(),
  questionListDigest: z.string(),
  htmlDigest: z.string(),
  sourceDigest: z.string(),
});

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedSearch(search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  params.set('document', params.get('document') ?? 'exam');
  params.sort();
  return params.toString();
}

export function createPrintSnapshotId(
  {
    assessmentInstanceId,
    authnUserId,
    search,
    questionListDigest,
    html,
    source,
  }: {
    assessmentInstanceId: string;
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
      assessmentInstanceId,
      authnUserId,
      search: normalizedSearch(search),
      questionListDigest,
      htmlDigest: digest(html),
      sourceDigest: digest(JSON.stringify(source)),
    },
    secretKey,
  );
}

export function checkPrintSnapshotId(
  {
    id,
    assessmentInstanceId,
    authnUserId,
    search,
    questionListDigest,
    html,
    source,
  }: {
    id: string;
    assessmentInstanceId: string;
    authnUserId: string;
    search: URLSearchParams;
    questionListDigest: string;
    html: string;
    source?: DocxSource;
  },
  secretKey: SecretKey,
): boolean {
  const result = SnapshotIdSchema.safeParse(
    getCheckedSignedTokenData(id, secretKey, { maxAge: SNAPSHOT_MAX_AGE_MS }),
  );
  if (!result.success) return false;
  const snapshot = result.data;
  return (
    snapshot.assessmentInstanceId === assessmentInstanceId &&
    snapshot.authnUserId === authnUserId &&
    snapshot.search === normalizedSearch(search) &&
    snapshot.questionListDigest === questionListDigest &&
    snapshot.htmlDigest === digest(html) &&
    (source === undefined || snapshot.sourceDigest === digest(JSON.stringify(source)))
  );
}
