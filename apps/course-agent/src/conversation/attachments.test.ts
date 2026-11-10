import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENTS,
  attachmentUrl,
} from '@prairielearn/course-agent-types';

import { UploadQuota, attachmentsToWrite, keepUploadReferences } from './attachments.js';

const SYLLABUS = '11111111-1111-4111-8111-111111111111';
const SCREENSHOT = '22222222-2222-4222-8222-222222222222';

const file = (url: string, filename: string) =>
  ({ type: 'file', mediaType: 'application/pdf', filename, url }) as const;

describe('keepUploadReferences', () => {
  it('drops file parts from the browser that carry contents or point elsewhere', () => {
    const message: UIMessage = {
      id: 'u1',
      role: 'user',
      parts: [
        { type: 'text', text: 'Use these' },
        file(attachmentUrl(SYLLABUS), 'syllabus.pdf'),
        file('data:application/pdf;base64,JVBERi0=', 'inline.pdf'),
        file(`upload:${SYLLABUS}/../other`, 'other.pdf'),
        file('https://example.com/exam.pdf', 'exam.pdf'),
      ],
    };
    expect(keepUploadReferences(message).parts).toEqual([
      { type: 'text', text: 'Use these' },
      file(attachmentUrl(SYLLABUS), 'syllabus.pdf'),
    ]);
  });
});

describe('attachmentsToWrite', () => {
  const earlier: UIMessage[] = [
    { id: 'u1', role: 'user', parts: [file(attachmentUrl(SYLLABUS), 'syllabus.pdf')] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Read it.' }] },
  ];
  const message: UIMessage = {
    id: 'u2',
    role: 'user',
    parts: [file(attachmentUrl(SCREENSHOT), 'q4.png')],
  };

  it('copies earlier attachments only into a new or restored sandbox', () => {
    expect(attachmentsToWrite(earlier, message, true)).toEqual([
      { id: SYLLABUS, filename: 'syllabus.pdf' },
      { id: SCREENSHOT, filename: 'q4.png' },
    ]);
    expect(attachmentsToWrite(earlier, message, false)).toEqual([
      { id: SCREENSHOT, filename: 'q4.png' },
    ]);
  });
});

describe('UploadQuota', () => {
  it('counts concurrent reservations against each other from one listing', async () => {
    const countUploads = vi.fn(async () => ({ count: 0, bytes: 9 * MAX_ATTACHMENT_BYTES }));
    const quota = new UploadQuota(countUploads);
    // 180 MB are stored, so only one more 20 MB upload fits under 200 MB.
    const reserved = await Promise.all(
      Array.from({ length: 5 }, () => quota.reserve(MAX_ATTACHMENT_BYTES)),
    );
    expect(reserved.filter(Boolean)).toHaveLength(1);
    expect(countUploads).toHaveBeenCalledTimes(1);

    await quota.release(MAX_ATTACHMENT_BYTES);
    expect(await quota.reserve(MAX_ATTACHMENT_BYTES)).toBe(true);
  });

  it('ignores a release after a restart, counting from R2 instead', async () => {
    const quota = new UploadQuota(async () => ({
      count: MAX_CONVERSATION_ATTACHMENTS - 1,
      bytes: 0,
    }));
    await quota.release(MAX_ATTACHMENT_BYTES);
    expect(await quota.reserve(1)).toBe(true);
    expect(await quota.reserve(1)).toBe(false);
  });

  it('caps the number of uploads, and counts again after a failed listing', async () => {
    const countUploads = vi
      .fn<() => Promise<{ count: number; bytes: number }>>()
      .mockRejectedValueOnce(new Error('R2 unavailable'))
      .mockResolvedValue({ count: MAX_CONVERSATION_ATTACHMENTS - 1, bytes: 0 });
    const quota = new UploadQuota(countUploads);
    await expect(quota.reserve(1)).rejects.toThrow('R2 unavailable');
    expect(await quota.reserve(1)).toBe(true);
    expect(await quota.reserve(1)).toBe(false);
  });
});
