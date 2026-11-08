import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { attachmentUrl } from '@prairielearn/course-agent-types';

import { attachmentsToWrite, keepUploadReferences } from './attachments.js';

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
