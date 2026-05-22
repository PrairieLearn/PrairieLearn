import path from 'node:path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { describe, expect, it } from 'vitest';

import { deduplicateIdenticalQuestions, serializeClientFiles } from './instructorQtiImport.js';
import type { StoredSerializedConversionResult } from './instructorQtiImport.types.js';

function makeResult({
  directoryPrefix,
  sourceType = 'assessment',
  sourceId = directoryPrefix,
  questionSourceId = `${sourceId}-q1`,
  questionHtml = '<pl-question-panel><p>What is 2 + 2?</p></pl-question-panel>',
}: {
  directoryPrefix: string;
  sourceType?: 'assessment' | 'question-bank';
  sourceId?: string;
  questionSourceId?: string;
  questionHtml?: string;
}): StoredSerializedConversionResult {
  const questionDirectoryName = `imported/${directoryPrefix}/q1`;
  return {
    sourceId,
    assessmentTitle: directoryPrefix,
    sourceType,
    assessment: {
      directoryName: directoryPrefix,
      infoJson: {
        uuid: `${sourceId}-assessment-uuid`,
        type: 'Homework',
        title: directoryPrefix,
        set: 'Homework',
        number: '1',
        zones: [
          {
            title: 'Questions',
            questions: [{ id: questionDirectoryName, autoPoints: 1 }],
          },
        ],
      },
    },
    questions: [
      {
        directoryName: questionDirectoryName,
        sourceId: questionSourceId,
        infoJson: {
          uuid: `${questionSourceId}-uuid`,
          title: 'Question 1',
          topic: directoryPrefix,
          tags: ['imported'],
          type: 'v3',
          singleVariant: true,
          gradingMethod: 'Internal',
        },
        questionHtml,
        clientFiles: {
          'image.png': 'aW1hZ2U=',
        },
        skippedVideos: [],
      },
    ],
    warnings: [
      {
        questionId: questionSourceId,
        message: 'Unsupported rubric data',
        level: 'warn',
      },
    ],
  };
}

describe('serializeClientFiles', () => {
  it('encodes buffer content as base64', async () => {
    const files = new Map<string, Buffer | string>([['image.png', Buffer.from('fake png data')]]);
    const { files: result } = await serializeClientFiles(files, '/nonexistent');
    expect(result['image.png']).toBe(Buffer.from('fake png data').toString('base64'));
  });

  it('reads string content from web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      await fs.outputFile(path.join(tempDir, 'asset.png'), 'fake asset content');

      const files = new Map<string, Buffer | string>([['asset.png', 'asset.png']]);
      const { files: result } = await serializeClientFiles(files, tempDir);
      expect(result['asset.png']).toBe(Buffer.from('fake asset content').toString('base64'));
    } finally {
      await cleanup();
    }
  });

  it('reports string paths that escape web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['evil.txt', '../../etc/passwd']]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('evil.txt');
      expect(missingFiles).toEqual(['evil.txt']);
    } finally {
      await cleanup();
    }
  });

  it('reports files that do not exist', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['missing.png', 'nonexistent.png']]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('missing.png');
      expect(missingFiles).toEqual(['missing.png']);
    } finally {
      await cleanup();
    }
  });
});

describe('deduplicateIdenticalQuestions', () => {
  it('rewrites copied identical questions to a single canonical directory', () => {
    const results = deduplicateIdenticalQuestions([
      makeResult({ directoryPrefix: 'quiz-1', sourceId: 'quiz-1', questionSourceId: 'copy-a' }),
      makeResult({ directoryPrefix: 'quiz-2', sourceId: 'quiz-2', questionSourceId: 'copy-b' }),
    ]);

    expect(results[0].questions).toHaveLength(1);
    expect(results[1].questions).toHaveLength(1);
    expect(results[1].questions[0].directoryName).toBe(results[0].questions[0].directoryName);
    expect(results[1].assessment.infoJson.zones[0].questions[0].id).toBe(
      results[0].questions[0].directoryName,
    );
    expect(results[1].warnings[0].questionId).toBe(results[0].questions[0].sourceId);
  });

  it('does not deduplicate questions with different generated content', () => {
    const results = deduplicateIdenticalQuestions([
      makeResult({ directoryPrefix: 'quiz-1' }),
      makeResult({
        directoryPrefix: 'quiz-2',
        questionHtml: '<pl-question-panel><p>What is 3 + 3?</p></pl-question-panel>',
      }),
    ]);

    expect(results[1].questions[0].directoryName).toBe('imported/quiz-2/q1');
    expect(results[1].assessment.infoJson.zones[0].questions[0].id).toBe('imported/quiz-2/q1');
  });

  it('prefers question bank questions as canonical when available', () => {
    const results = deduplicateIdenticalQuestions([
      makeResult({ directoryPrefix: 'quiz-1', sourceId: 'quiz-1', questionSourceId: 'copy-a' }),
      makeResult({
        directoryPrefix: 'bank-1',
        sourceType: 'question-bank',
        sourceId: 'bank-1',
        questionSourceId: 'bank-copy',
      }),
    ]);

    expect(results[0].questions[0].directoryName).toBe('imported/bank-1/q1');
    expect(results[0].assessment.infoJson.zones[0].questions[0].id).toBe('imported/bank-1/q1');
    expect(results[1].questions[0].directoryName).toBe('imported/bank-1/q1');
  });
});
