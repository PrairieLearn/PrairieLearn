import { describe, expect, it } from 'vitest';

import { parsePrintBlockSize, planPrintQuestionPages } from './print-question-layout.js';

describe('parsePrintBlockSize', () => {
  it('defaults absent values to auto', () => {
    expect(parsePrintBlockSize(undefined)).toBe('auto');
    expect(parsePrintBlockSize('')).toBe('auto');
  });

  it.each(['auto', 'third', 'half', 'full'] as const)('accepts %s', (blockSize) => {
    expect(parsePrintBlockSize(blockSize)).toBe(blockSize);
  });

  it('rejects unsupported values', () => {
    expect(() => parsePrintBlockSize('quarter')).toThrow(
      'Invalid print block size "quarter". Expected auto, third, half, or full.',
    );
  });
});

describe('planPrintQuestionPages', () => {
  it('packs sequential automatic questions onto the same page when they fit', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [
        { id: 'Question 1', naturalHeight: 200, blockSize: 'auto' },
        { id: 'Question 2', naturalHeight: 300, blockSize: 'auto' },
        { id: 'Question 3', naturalHeight: 400, blockSize: 'auto' },
      ],
    });

    expect(pages).toMatchObject([
      {
        reservedHeight: 900,
        allowsFlow: false,
        questions: [{ id: 'Question 1' }, { id: 'Question 2' }, { id: 'Question 3' }],
      },
    ]);
  });

  it('moves the next automatic question to a new page when needed', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [
        { id: 'Question 1', naturalHeight: 500, blockSize: 'auto' },
        { id: 'Question 2', naturalHeight: 500, blockSize: 'auto' },
      ],
    });

    expect(pages.map((page) => page.questions.map((question) => question.id))).toEqual([
      ['Question 1'],
      ['Question 2'],
    ]);
  });

  it('reserves exact page fractions for explicit block sizes', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [
        { id: 'Question 1', naturalHeight: 100, blockSize: 'third' },
        { id: 'Question 2', naturalHeight: 200, blockSize: 'half' },
        { id: 'Question 3', naturalHeight: 100, blockSize: 'third' },
      ],
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].questions.map((question) => question.reservedHeight)).toEqual([300, 450]);
    expect(pages[1].questions[0].reservedHeight).toBe(300);
  });

  it('allows three one-third blocks to share a page without rounding overflow', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 937.92,
      questions: [1, 2, 3].map((questionNumber) => ({
        id: `Question ${questionNumber}`,
        naturalHeight: 100,
        blockSize: 'third' as const,
      })),
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].questions).toHaveLength(3);
  });

  it('moves a question past a full requested block when its content needs more space', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [
        { id: 'Question 1', naturalHeight: 400, blockSize: 'half' },
        { id: 'Question 2', naturalHeight: 501, blockSize: 'half' },
      ],
    });

    expect(pages.map((page) => page.questions.map((question) => question.id))).toEqual([
      ['Question 1'],
      ['Question 2'],
    ]);
    expect(pages.map((page) => page.reservedHeight)).toEqual([450, 501]);
    expect(pages.map((page) => page.allowsFlow)).toEqual([false, false]);
  });

  it('allows an explicit block to flow when its content exceeds a page', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [{ id: 'Question 1', naturalHeight: 1_000, blockSize: 'half' }],
    });

    expect(pages[0]).toMatchObject({
      reservedHeight: 1_000,
      allowsFlow: true,
      questions: [{ reservedHeight: 1_000, allowsFlow: true }],
    });
  });

  it('isolates an oversized question so subpart page breaks cannot split adjacent questions', () => {
    const pages = planPrintQuestionPages({
      pageHeight: 900,
      questions: [
        { id: 'Question 1', naturalHeight: 200, blockSize: 'auto' },
        { id: 'Question 2', naturalHeight: 1_000, blockSize: 'auto' },
        { id: 'Question 3', naturalHeight: 200, blockSize: 'auto' },
      ],
    });

    expect(pages.map((page) => page.questions.map((question) => question.id))).toEqual([
      ['Question 1'],
      ['Question 2'],
      ['Question 3'],
    ]);
    expect(pages.map((page) => page.allowsFlow)).toEqual([false, true, false]);
  });

  it('rejects invalid measurements', () => {
    expect(() => planPrintQuestionPages({ pageHeight: 0, questions: [] })).toThrow(
      'The printable page height must be a positive number',
    );
    expect(() =>
      planPrintQuestionPages({
        pageHeight: 900,
        questions: [{ id: 'Question 1', naturalHeight: NaN, blockSize: 'auto' }],
      }),
    ).toThrow('Question 1 has an invalid measured height');
  });
});
