import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { attachmentUrl } from '@prairielearn/course-agent-types';

import {
  attachmentPath,
  formatRequest,
  keepUploadReferences,
  streamImageType,
} from './attachments.js';

const SYLLABUS = '11111111-1111-4111-8111-111111111111';
const SCREENSHOT = '22222222-2222-4222-8222-222222222222';

const file = (url: string, filename: string) =>
  ({ type: 'file', mediaType: 'application/pdf', filename, url }) as const;

describe('keepUploadReferences', () => {
  it('keeps an uploaded file in chat history, but not inline contents or other paths', () => {
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

describe('attachmentPath', () => {
  it.each([
    ['notes.pdf', 'notes.pdf'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\notes.pdf', 'notes.pdf'],
    ['..', 'file'],
    ['line\nbreak.txt', 'linebreak.txt'],
    ['', 'file'],
  ])('stores %j as %j in its upload directory', (filename, name) => {
    expect(attachmentPath({ id: SYLLABUS, filename })).toBe(`/uploads/${SYLLABUS}/${name}`);
  });

  it('shortens a long name to a valid filename that keeps its extension', () => {
    const path = attachmentPath({ id: SYLLABUS, filename: `${'试'.repeat(120)}.pdf` });
    const name = path.slice(path.lastIndexOf('/') + 1);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
    expect(name).toMatch(/^试+\.pdf$/);
  });
});

describe('formatRequest', () => {
  it('gives the agent attached files the way the Codex desktop app does', () => {
    const attachments = [
      { id: SYLLABUS, filename: 'syllabus.pdf' },
      { id: SCREENSHOT, filename: 'screenshot.png' },
    ];
    expect(formatRequest('Summarize these', attachments, new Set([SCREENSHOT]))).toBe(
      [
        '',
        '# Files mentioned by the user:',
        '',
        `## syllabus.pdf: /uploads/${SYLLABUS}/syllabus.pdf`,
        '',
        `## screenshot.png: /uploads/${SCREENSHOT}/screenshot.png`,
        'Image attachment: true',
        '',
        '## My request:',
        'Summarize these',
        '',
      ].join('\n'),
    );
    expect(formatRequest('Fix the typo', [], new Set())).toBe('Fix the typo');
  });
});

describe('streamImageType', () => {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  /** These chunks, then more zeros than anything should read unless `end` is set. */
  function streamOf(chunks: number[][], { end = true } = {}) {
    let cancelled = false;
    const queue = [...chunks];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = queue.shift();
        if (chunk) controller.enqueue(new Uint8Array(chunk));
        else if (end) controller.close();
        else controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    return { stream, cancelled: () => cancelled };
  }

  it('recognizes a signature split across chunks, then cancels the rest', async () => {
    const { stream, cancelled } = streamOf(
      [PNG_SIGNATURE.slice(0, 3), PNG_SIGNATURE.slice(3), [1, 2, 3, 4, 5, 6, 7]],
      { end: false },
    );
    expect(await streamImageType(stream)).toBe('image/png');
    expect(cancelled()).toBe(true);
  });

  it('returns null for a file shorter than a signature, or one that is not an image', async () => {
    expect(await streamImageType(streamOf([PNG_SIGNATURE.slice(0, 4)]).stream)).toBeNull();
    expect(
      await streamImageType(streamOf([[...new TextEncoder().encode('%PDF-1.7 ...')]]).stream),
    ).toBeNull();
  });
});
