import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { SerializedQuestionOutput } from '../instructorQtiImport.types.js';

import {
  NonRubricWarnings,
  QuestionBankDeduplicationWarning,
  REMOTE_IMAGE_URL_WARNING,
  buildQuestionWarningsByDirectoryName,
  fileSizeWarning,
} from './ImportReviewComponents.js';

function makeQuestion({
  directoryName,
  sourceId,
}: {
  directoryName: string;
  sourceId: string;
}): SerializedQuestionOutput {
  return {
    draftId: 'draft',
    originalDirectoryName: directoryName,
    directoryName,
    sourceId,
    infoJson: {
      uuid: `${sourceId}-uuid`,
      title: sourceId,
      topic: 'imported',
      tags: ['imported'],
      type: 'v3',
    },
    questionHtml: '<pl-question-panel></pl-question-panel>',
    clientFiles: {},
    skippedVideos: [],
  };
}

describe('NonRubricWarnings', () => {
  it('collapses remote image URL warnings in the overview', () => {
    const html = renderToStaticMarkup(
      <NonRubricWarnings
        questions={[
          makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1' }),
          makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2' }),
        ]}
        warnings={[
          { questionId: 'imported/quiz/q1', message: REMOTE_IMAGE_URL_WARNING },
          { questionId: 'imported/quiz/q2', message: REMOTE_IMAGE_URL_WARNING },
        ]}
      />,
    );

    expect(
      html.match(/One or more questions contain an image reference to a remote URL/g),
    ).toHaveLength(1);
    expect(html).not.toContain(REMOTE_IMAGE_URL_WARNING);
  });
});

describe('QuestionBankDeduplicationWarning', () => {
  it('shows how many question bank questions were deduplicated', () => {
    const html = renderToStaticMarkup(
      <QuestionBankDeduplicationWarning deduplicatedQuestionCount={2} />,
    );

    expect(html).toContain('2 questions appeared in multiple question banks');
    expect(html).toContain('will only be imported once');
  });
});

describe('fileSizeWarning', () => {
  it('allows files up to the QTI import upload limit', () => {
    expect(fileSizeWarning(new File(['x'], 'small.imscc'))).toBeNull();
  });

  it('warns for files over the QTI import upload limit', () => {
    const largeFile = new File([], 'large.imscc');
    Object.defineProperty(largeFile, 'size', { value: 101 * 1024 * 1024 });

    expect(fileSizeWarning(largeFile)).toBe(
      'This file is 101 MB. The maximum upload size is 100 MB.',
    );
  });
});

describe('buildQuestionWarningsByDirectoryName', () => {
  it('matches warnings by directory name, original directory name, or source id', () => {
    const [question] = [
      makeQuestion({
        directoryName: 'imported/quiz/q1',
        sourceId: 'source-q1',
      }),
    ];

    const warnings = buildQuestionWarningsByDirectoryName(
      [question],
      [
        { questionId: 'imported/quiz/q1', message: REMOTE_IMAGE_URL_WARNING },
        { questionId: 'source-q1', message: 'Unsupported question type "magic_question"' },
      ],
    );

    expect(warnings.get('imported/quiz/q1')?.map((warning) => warning.message)).toEqual([
      REMOTE_IMAGE_URL_WARNING,
      'Unsupported question type "magic_question"',
    ]);
  });
});
