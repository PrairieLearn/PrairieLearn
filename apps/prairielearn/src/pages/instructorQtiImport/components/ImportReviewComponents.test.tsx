import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { SerializedQuestionOutput } from '../instructorQtiImport.types.js';

import {
  NonRubricWarnings,
  QuestionBankDeduplicationWarning,
  REMOTE_IMAGE_URL_WARNING,
  buildQuestionWarningsByDirectoryName,
  findDuplicateQuestionTitles,
} from './ImportReviewComponents.js';

function makeQuestion({
  directoryName,
  sourceId,
  title = sourceId,
}: {
  directoryName: string;
  sourceId: string;
  title?: string;
}): SerializedQuestionOutput {
  return {
    draftId: 'draft',
    originalDirectoryName: directoryName,
    directoryName,
    sourceId,
    infoJson: {
      uuid: `${sourceId}-uuid`,
      title,
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

  it('includes duplicate question title warnings in the overview', () => {
    const html = renderToStaticMarkup(
      <NonRubricWarnings
        questions={[
          makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1', title: 'Question' }),
          makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2', title: 'Question' }),
        ]}
        warnings={[]}
      />,
    );

    expect(html).toContain('We detected several questions named');
    expect(html).toContain('Question');
    expect(html).toContain('find and edit them more easily in PrairieLearn');
  });

  it('rolls up multiple duplicate question titles into one generic warning', () => {
    const html = renderToStaticMarkup(
      <NonRubricWarnings
        questions={[
          makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1', title: 'Question' }),
          makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2', title: 'Question' }),
          makeQuestion({ directoryName: 'imported/quiz/q3', sourceId: 'q3', title: 'Quiz item' }),
          makeQuestion({ directoryName: 'imported/quiz/q4', sourceId: 'q4', title: 'Quiz item' }),
        ]}
        warnings={[]}
      />,
    );

    expect(html).toContain('We detected several questions with the same names');
    expect(html).not.toContain('questions named');
    expect(html).not.toContain('Quiz item');
  });

  it('combines duplicate title warnings with existing warnings in one alert', () => {
    const html = renderToStaticMarkup(
      <NonRubricWarnings
        questions={[
          makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1', title: 'Question' }),
          makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2', title: 'Question' }),
        ]}
        warnings={[{ questionId: 'imported/quiz/q1', message: REMOTE_IMAGE_URL_WARNING }]}
      />,
    );

    expect(html.match(/alert-warning/g)).toHaveLength(1);
    expect(html).toContain('One or more questions contain an image reference to a remote URL');
    expect(html).toContain('We detected several questions named');
  });
});

describe('QuestionBankDeduplicationWarning', () => {
  it('shows how many question bank questions were deduplicated', () => {
    const html = renderToStaticMarkup(
      <QuestionBankDeduplicationWarning deduplicatedQuestionCount={2} />,
    );

    expect(html).toContain('alert-info');
    expect(html).toContain('bi-info-circle-fill');
    expect(html).toContain('2 questions appeared in multiple question banks');
    expect(html).toContain('will only be imported once');
  });
});

describe('findDuplicateQuestionTitles', () => {
  it('finds duplicate current question titles', () => {
    const questions = [
      makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1', title: 'Question' }),
      makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2', title: 'Question' }),
      makeQuestion({ directoryName: 'imported/quiz/q3', sourceId: 'q3', title: 'Other' }),
    ];

    expect(findDuplicateQuestionTitles(questions, new Map())).toEqual(['Question']);
  });

  it('uses renamed question titles and ignores excluded questions', () => {
    const questions = [
      makeQuestion({ directoryName: 'imported/quiz/q1', sourceId: 'q1', title: 'Question' }),
      makeQuestion({ directoryName: 'imported/quiz/q2', sourceId: 'q2', title: 'Question' }),
      makeQuestion({ directoryName: 'imported/quiz/q3', sourceId: 'q3', title: 'Question' }),
    ];

    expect(
      findDuplicateQuestionTitles(
        questions,
        new Map([
          [
            'imported/quiz/q2',
            {
              title: 'Useful name',
              topic: 'imported',
              tags: ['imported'],
              included: true,
              originalDirName: 'imported/quiz/q2',
              collides: false,
              collisionStrategy: 'rename',
            },
          ],
          [
            'imported/quiz/q3',
            {
              title: 'Question',
              topic: 'imported',
              tags: ['imported'],
              included: false,
              originalDirName: 'imported/quiz/q3',
              collides: false,
              collisionStrategy: 'rename',
            },
          ],
        ]),
      ),
    ).toEqual([]);
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
