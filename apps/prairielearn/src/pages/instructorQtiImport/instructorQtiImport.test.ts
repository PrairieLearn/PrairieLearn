import path from 'node:path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { assert, describe, expect, it } from 'vitest';

import type { ConversionResult } from '@prairielearn/question-conversion';

import {
  countDeduplicatedQuestionBankQuestions,
  deduplicateIdenticalQuestions,
  serializeClientFiles,
  serializeConversionResult,
} from './instructorQtiImport.js';
import {
  DUPLICATE_ASSESSMENT_QUESTION_WARNING,
  type StoredSerializedConversionResult,
  deduplicateAssessmentZoneQuestions,
} from './instructorQtiImport.types.js';

function makeQuestions(directoryPrefix: string, questionSourceId: string, questionHtml: string) {
  const questionDirectoryName = `imported/${directoryPrefix}/q1`;
  return {
    questionDirectoryName,
    questions: [
      {
        directoryName: questionDirectoryName,
        sourceId: questionSourceId,
        infoJson: {
          uuid: `${questionSourceId}-uuid`,
          title: 'Question 1',
          topic: directoryPrefix,
          tags: ['imported'],
          type: 'v3' as const,
          singleVariant: true,
          gradingMethod: 'Internal' as const,
        },
        questionHtml,
        clientFiles: {
          'image.png': 'aW1hZ2U=',
        },
        skippedVideos: [] as string[],
      },
    ],
    warnings: [
      {
        questionId: questionSourceId,
        message: 'Unsupported rubric data',
        level: 'warn' as const,
      },
    ],
  };
}

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
  const { questionDirectoryName, questions, warnings } = makeQuestions(
    directoryPrefix,
    questionSourceId,
    questionHtml,
  );

  if (sourceType === 'question-bank') {
    return {
      sourceId,
      title: directoryPrefix,
      sourceType: 'question-bank',
      directoryName: directoryPrefix,
      questions,
      warnings,
    };
  }

  return {
    sourceId,
    title: directoryPrefix,
    sourceType: 'assessment',
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
    questions,
    warnings,
  };
}

function makeConversionResult({
  sourceType,
  directoryName,
}: {
  sourceType: 'assessment' | 'question-bank';
  directoryName: string;
}): ConversionResult {
  return {
    sourceId: directoryName,
    assessmentTitle: directoryName,
    sourceType,
    assessment: {
      directoryName,
      infoJson: {
        uuid: `${directoryName}-uuid`,
        type: 'Homework',
        title: directoryName,
        set: 'Homework',
        number: '1',
        zones: [],
      },
    },
    questions: [],
    warnings: [],
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

  it('falls back to HTML-decoded paths when reading string content', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      await fs.outputFile(path.join(tempDir, 'TemplateINC&CF.jpg'), 'fake asset content');

      const files = new Map<string, Buffer | string>([
        ['TemplateINC&CF.jpg', 'TemplateINC&amp;CF.jpg?canvas_download=1'],
      ]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result['TemplateINC&CF.jpg']).toBe(
        Buffer.from('fake asset content').toString('base64'),
      );
      expect(missingFiles).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('falls back to URL-decoded paths when reading string content', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      await fs.outputFile(path.join(tempDir, 'Quiz Files/asset 1.png'), 'fake asset content');

      const files = new Map<string, Buffer | string>([
        ['asset 1.png', 'Quiz%20Files/asset%201.png?canvas_download=1'],
      ]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result['asset 1.png']).toBe(Buffer.from('fake asset content').toString('base64'));
      expect(missingFiles).toEqual([]);
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

describe('serializeConversionResult', () => {
  it('uses the unique container slug for assessment directory names', async () => {
    const { result } = await serializeConversionResult(
      makeConversionResult({
        sourceType: 'assessment',
        directoryName: 'defaultwebctcategory',
      }),
      'defaultwebctcategory-2',
      '/nonexistent',
    );

    assert(result.sourceType === 'assessment');
    expect(result.assessment.directoryName).toBe('defaultwebctcategory-2');
  });

  it('uses the unique container slug for question bank directory names', async () => {
    const { result } = await serializeConversionResult(
      makeConversionResult({
        sourceType: 'question-bank',
        directoryName: 'unfiled-questions',
      }),
      'unfiled-questions-2',
      '/nonexistent',
    );

    assert(result.sourceType === 'question-bank');
    expect(result.directoryName).toBe('unfiled-questions-2');
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
    assert(results[1].sourceType === 'assessment');
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
    assert(results[1].sourceType === 'assessment');
    expect(results[1].assessment.infoJson.zones[0].questions[0].id).toBe('imported/quiz-2/q1');
  });

  it('removes duplicate zone references when identical questions appear on the same assessment', () => {
    const base = makeResult({ directoryPrefix: 'quiz-1', questionSourceId: 'copy-a' });
    const { questions: duplicateQuestions } = makeQuestions(
      'quiz-1',
      'copy-b',
      '<pl-question-panel><p>What is 2 + 2?</p></pl-question-panel>',
    );
    duplicateQuestions[0].directoryName = 'imported/quiz-1/q2';
    assert(base.sourceType === 'assessment');
    const result: StoredSerializedConversionResult = {
      ...base,
      questions: [...base.questions, ...duplicateQuestions],
      assessment: {
        ...base.assessment,
        infoJson: {
          ...base.assessment.infoJson,
          zones: [
            {
              title: 'Questions',
              questions: [
                { id: 'imported/quiz-1/q1', autoPoints: 1 },
                { id: 'imported/quiz-1/q2', autoPoints: 1 },
              ],
            },
          ],
        },
      },
    };

    const [deduped] = deduplicateIdenticalQuestions([result]);

    assert(deduped.sourceType === 'assessment');
    expect(deduped.questions).toHaveLength(1);
    expect(deduped.assessment.infoJson.zones[0].questions).toEqual([
      { id: 'imported/quiz-1/q1', autoPoints: 1 },
    ]);
    expect(deduped.warnings).toContainEqual({
      questionId: 'imported/quiz-1/q1',
      message: DUPLICATE_ASSESSMENT_QUESTION_WARNING,
      level: 'warn',
    });
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
    assert(results[0].sourceType === 'assessment');
    expect(results[0].assessment.infoJson.zones[0].questions[0].id).toBe('imported/bank-1/q1');
    expect(results[1].questions[0].directoryName).toBe('imported/bank-1/q1');
  });
});

describe('deduplicateAssessmentZoneQuestions', () => {
  it('returns zones unchanged when there are no duplicates', () => {
    const zones = [
      { title: 'Zone 1', questions: [{ id: 'q1', autoPoints: 1 }] },
      { title: 'Zone 2', questions: [{ id: 'q2', autoPoints: 1 }], numberChoose: 1 },
    ];

    const result = deduplicateAssessmentZoneQuestions(zones);

    expect(result.zones).toEqual(zones);
    expect(result.warnings).toEqual([]);
  });

  it('keeps only the first occurrence of a question repeated within a zone', () => {
    const result = deduplicateAssessmentZoneQuestions([
      {
        title: 'Questions',
        questions: [
          { id: 'q1', autoPoints: 1 },
          { id: 'q2', autoPoints: 1 },
          { id: 'q1', autoPoints: 2 },
        ],
      },
    ]);

    expect(result.zones).toEqual([
      {
        title: 'Questions',
        questions: [
          { id: 'q1', autoPoints: 1 },
          { id: 'q2', autoPoints: 1 },
        ],
      },
    ]);
    expect(result.warnings).toEqual([
      { questionId: 'q1', message: DUPLICATE_ASSESSMENT_QUESTION_WARNING, level: 'warn' },
    ]);
  });

  it('removes duplicates across zones and drops zones left empty', () => {
    const result = deduplicateAssessmentZoneQuestions([
      { title: 'Direct questions', questions: [{ id: 'q1', autoPoints: 1 }] },
      { title: 'Bank group', questions: [{ id: 'q1', autoPoints: 1 }], numberChoose: 1 },
    ]);

    expect(result.zones).toEqual([
      { title: 'Direct questions', questions: [{ id: 'q1', autoPoints: 1 }] },
    ]);
    expect(result.warnings).toEqual([
      { questionId: 'q1', message: DUPLICATE_ASSESSMENT_QUESTION_WARNING, level: 'warn' },
    ]);
  });

  it('drops numberChoose when removals shrink the zone to that size', () => {
    const result = deduplicateAssessmentZoneQuestions([
      { title: 'Direct questions', questions: [{ id: 'q1', autoPoints: 1 }] },
      {
        title: 'Bank group',
        questions: [
          { id: 'q1', autoPoints: 1 },
          { id: 'q2', autoPoints: 1 },
        ],
        numberChoose: 1,
      },
    ]);

    expect(result.zones).toEqual([
      { title: 'Direct questions', questions: [{ id: 'q1', autoPoints: 1 }] },
      { title: 'Bank group', questions: [{ id: 'q2', autoPoints: 1 }] },
    ]);
  });

  it('preserves numberChoose when enough questions remain', () => {
    const result = deduplicateAssessmentZoneQuestions([
      { title: 'Direct questions', questions: [{ id: 'q1', autoPoints: 1 }] },
      {
        title: 'Bank group',
        questions: [
          { id: 'q1', autoPoints: 1 },
          { id: 'q2', autoPoints: 1 },
          { id: 'q3', autoPoints: 1 },
        ],
        numberChoose: 1,
      },
    ]);

    expect(result.zones[1]).toEqual({
      title: 'Bank group',
      questions: [
        { id: 'q2', autoPoints: 1 },
        { id: 'q3', autoPoints: 1 },
      ],
      numberChoose: 1,
    });
  });

  it('reports a question repeated more than twice only once', () => {
    const result = deduplicateAssessmentZoneQuestions([
      {
        title: 'Questions',
        questions: [
          { id: 'q1', autoPoints: 1 },
          { id: 'q1', autoPoints: 1 },
          { id: 'q1', autoPoints: 1 },
        ],
      },
    ]);

    expect(result.zones[0].questions).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('countDeduplicatedQuestionBankQuestions', () => {
  it('counts unique questions that appeared in multiple question banks', () => {
    const results = [
      makeResult({
        directoryPrefix: 'bank-1',
        sourceType: 'question-bank',
        sourceId: 'bank-1',
        questionSourceId: 'bank-1-copy',
      }),
      makeResult({
        directoryPrefix: 'bank-2',
        sourceType: 'question-bank',
        sourceId: 'bank-2',
        questionSourceId: 'bank-2-copy',
      }),
    ];

    expect(countDeduplicatedQuestionBankQuestions(results)).toBe(1);
  });

  it('does not count identical questions outside multiple question banks', () => {
    const results = [
      makeResult({
        directoryPrefix: 'quiz-1',
        sourceType: 'assessment',
        sourceId: 'quiz-1',
        questionSourceId: 'quiz-copy',
      }),
      makeResult({
        directoryPrefix: 'bank-1',
        sourceType: 'question-bank',
        sourceId: 'bank-1',
        questionSourceId: 'bank-copy',
      }),
    ];

    expect(countDeduplicatedQuestionBankQuestions(results)).toBe(0);
  });
});
