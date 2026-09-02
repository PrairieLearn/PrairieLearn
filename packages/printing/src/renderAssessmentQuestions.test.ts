import { describe, expect, it, vi } from 'vitest';

import {
  type PrintingAdapter,
  type QuestionTransformer,
  renderAssessmentInstanceQuestions,
  renderAssessmentInstanceQuestionsReport,
  renderAssessmentQuestions,
  renderAssessmentQuestionsReport,
} from './renderAssessmentQuestions.js';

interface Assessment {
  id: string;
}

interface AssessmentInstance {
  id: string;
}

interface Question {
  id: string;
  type: string;
}

function createAdapter(
  assessmentInstance: AssessmentInstance,
  questions: readonly Question[],
): PrintingAdapter<Assessment, AssessmentInstance, Question, string> {
  return {
    createFreshAssessmentInstance: async () => assessmentInstance,
    getQuestions: async () => questions,
    getQuestionType: async (question) => question.type,
    renderQuestion: async (question) => `<div>${question.id}</div>`,
  };
}

describe('renderAssessmentQuestions', () => {
  it('creates a fresh assessment instance and preserves question order', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const questions = [
      { id: 'question-2', type: 'essay' },
      { id: 'question-1', type: 'multiple-choice' },
    ];
    const createFreshAssessmentInstance = vi.fn(async () => assessmentInstance);
    const getQuestions = vi.fn(async () => questions);
    const getQuestionType = vi.fn((question: Question) => question.type);
    const renderQuestion = vi.fn(async (question: Question) => `<p>${question.id}</p>`);

    const result = await renderAssessmentQuestions({
      assessment,
      adapter: {
        createFreshAssessmentInstance,
        getQuestions,
        getQuestionType,
        renderQuestion,
      },
    });

    expect(result).toEqual(['<p>question-2</p>', '<p>question-1</p>']);
    expect(createFreshAssessmentInstance).toHaveBeenCalledExactlyOnceWith(assessment);
    expect(getQuestions).toHaveBeenCalledExactlyOnceWith(assessmentInstance, assessment);
    expect(getQuestionType.mock.calls).toEqual([
      [questions[0], assessmentInstance, assessment],
      [questions[1], assessmentInstance, assessment],
    ]);
    expect(renderQuestion.mock.calls).toEqual([
      [questions[0], assessmentInstance, assessment],
      [questions[1], assessmentInstance, assessment],
    ]);
  });

  it('uses an exact question-type transformer with the complete context', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'multiple-choice' };
    const transformer = vi.fn<
      QuestionTransformer<Assessment, AssessmentInstance, Question, string>
    >(async ({ html }) => `<article>${html}</article>`);

    const result = await renderAssessmentQuestions({
      assessment,
      adapter: createAdapter(assessmentInstance, [question]),
      questionTransformers: new Map([['multiple-choice', transformer]]),
      defaultQuestionTransformer: () => 'default',
    });

    expect(result).toEqual(['<article><div>question-1</div></article>']);
    expect(transformer).toHaveBeenCalledWith({
      assessment,
      assessmentInstance,
      question,
      questionType: 'multiple-choice',
      index: 0,
      html: '<div>question-1</div>',
    });
  });

  it('renders a supplied assessment instance without creating another one', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const adapter = createAdapter(assessmentInstance, [question]);

    const result = await renderAssessmentInstanceQuestions({
      assessment,
      assessmentInstance,
      adapter,
    });

    expect(result).toEqual(['<div>question-1</div>']);
  });

  it('uses the default transformer for unmatched types and otherwise preserves the HTML', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const adapter = createAdapter(assessmentInstance, [question]);

    const transformed = await renderAssessmentQuestions({
      assessment,
      adapter,
      questionTransformers: new Map([
        ['multiple-choice', async ({ html }) => `<section>${html}</section>`],
      ]),
      defaultQuestionTransformer: async ({ html }) => `<main>${html}</main>`,
    });
    const unchanged = await renderAssessmentQuestions({
      assessment,
      adapter,
      questionTransformers: new Map([
        ['multiple-choice', async ({ html }) => `<section>${html}</section>`],
      ]),
    });

    expect(transformed).toEqual(['<main><div>question-1</div></main>']);
    expect(unchanged).toEqual(['<div>question-1</div>']);
  });

  it('renders and transforms questions serially', async () => {
    const events: string[] = [];
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const questions = [
      { id: 'question-1', type: 'essay' },
      { id: 'question-2', type: 'essay' },
    ];

    await renderAssessmentQuestions({
      assessment,
      adapter: {
        createFreshAssessmentInstance: async () => assessmentInstance,
        getQuestions: async () => questions,
        getQuestionType: async (question) => {
          events.push(`type:${question.id}`);
          await Promise.resolve();
          return question.type;
        },
        renderQuestion: async (question) => {
          events.push(`render:start:${question.id}`);
          await Promise.resolve();
          events.push(`render:end:${question.id}`);
          return `<div>${question.id}</div>`;
        },
      },
      defaultQuestionTransformer: async ({ question, html }) => {
        events.push(`transform:start:${question.id}`);
        await Promise.resolve();
        events.push(`transform:end:${question.id}`);
        return html;
      },
    });

    expect(events).toEqual([
      'type:question-1',
      'render:start:question-1',
      'render:end:question-1',
      'transform:start:question-1',
      'transform:end:question-1',
      'type:question-2',
      'render:start:question-2',
      'render:end:question-2',
      'transform:start:question-2',
      'transform:end:question-2',
    ]);
  });
});

describe('renderAssessmentQuestionsReport', () => {
  it('returns the fresh assessment instance and ordered rendered-question metadata', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const questions = [
      { id: 'question-2', type: 'essay' },
      { id: 'question-1', type: 'multiple-choice' },
    ];

    const result = await renderAssessmentQuestionsReport({
      assessment,
      adapter: createAdapter(assessmentInstance, questions),
    });

    expect(result).toEqual({
      assessmentInstance,
      questionResults: [
        {
          status: 'rendered',
          question: questions[0],
          questionType: 'essay',
          index: 0,
          html: '<div>question-2</div>',
        },
        {
          status: 'rendered',
          question: questions[1],
          questionType: 'multiple-choice',
          index: 1,
          html: '<div>question-1</div>',
        },
      ],
    });
  });

  it('records classified rendering failures and continues with later questions', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const questions = [
      { id: 'question-1', type: 'essay' },
      { id: 'question-2', type: 'essay' },
      { id: 'question-3', type: 'essay' },
    ];
    const brokenQuestionError = new Error('course-controlled details');
    const classifyQuestionError = vi.fn((error: unknown) =>
      error === brokenQuestionError ? { code: 'broken-question' as const } : undefined,
    );

    const result = await renderAssessmentInstanceQuestionsReport({
      assessment,
      assessmentInstance,
      adapter: {
        getQuestions: () => questions,
        getQuestionType: (question) => question.type,
        renderQuestion: (question) => {
          if (question.id === 'question-2') throw brokenQuestionError;
          return `<div>${question.id}</div>`;
        },
        classifyQuestionError,
      },
    });

    expect(result.questionResults).toEqual([
      {
        status: 'rendered',
        question: questions[0],
        questionType: 'essay',
        index: 0,
        html: '<div>question-1</div>',
      },
      {
        status: 'failed',
        question: questions[1],
        questionType: 'essay',
        index: 1,
        stage: 'render',
        failure: { code: 'broken-question' },
      },
      {
        status: 'rendered',
        question: questions[2],
        questionType: 'essay',
        index: 2,
        html: '<div>question-3</div>',
      },
    ]);
    expect(classifyQuestionError).toHaveBeenCalledExactlyOnceWith(brokenQuestionError, {
      assessment,
      assessmentInstance,
      question: questions[1],
      index: 1,
      stage: 'render',
      questionType: 'essay',
      html: undefined,
    });
  });

  it('provides the original HTML when classifying a transformer failure', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const transformError = new Error('transform failed');
    const classifyQuestionError = vi.fn(() => ({ code: 'unsupported-for-paper' as const }));

    const result = await renderAssessmentInstanceQuestionsReport({
      assessment,
      assessmentInstance,
      adapter: {
        ...createAdapter(assessmentInstance, [question]),
        classifyQuestionError,
      },
      defaultQuestionTransformer: () => {
        throw transformError;
      },
    });

    expect(result.questionResults).toEqual([
      {
        status: 'failed',
        question,
        questionType: 'essay',
        index: 0,
        stage: 'transform',
        failure: { code: 'unsupported-for-paper' },
      },
    ]);
    expect(classifyQuestionError).toHaveBeenCalledExactlyOnceWith(transformError, {
      assessment,
      assessmentInstance,
      question,
      index: 0,
      stage: 'transform',
      questionType: 'essay',
      html: '<div>question-1</div>',
    });
  });

  it('can explicitly classify a question-type failure', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const typeError = new Error('type failed');

    const result = await renderAssessmentInstanceQuestionsReport({
      assessment,
      assessmentInstance,
      adapter: {
        getQuestions: () => [question],
        getQuestionType: () => {
          throw typeError;
        },
        renderQuestion: () => '<div>unreachable</div>',
        classifyQuestionError: (_error, context) => ({ stageSeen: context.stage }),
      },
    });

    expect(result.questionResults).toEqual([
      {
        status: 'failed',
        question,
        questionType: undefined,
        index: 0,
        stage: 'question-type',
        failure: { stageSeen: 'question-type' },
      },
    ]);
  });

  it('rethrows unclassified question errors', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const infrastructureError = new Error('database unavailable');

    await expect(
      renderAssessmentInstanceQuestionsReport({
        assessment,
        assessmentInstance,
        adapter: {
          ...createAdapter(assessmentInstance, [question]),
          renderQuestion: () => {
            throw infrastructureError;
          },
          classifyQuestionError: () => undefined,
        },
      }),
    ).rejects.toBe(infrastructureError);
  });

  it('does not offer assessment-level infrastructure errors to the question classifier', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const infrastructureError = new Error('database unavailable');
    const classifyQuestionError = vi.fn(() => ({ code: 'incorrectly-classified' }));

    await expect(
      renderAssessmentInstanceQuestionsReport({
        assessment,
        assessmentInstance,
        adapter: {
          getQuestions: () => {
            throw infrastructureError;
          },
          getQuestionType: (question: Question) => question.type,
          renderQuestion: (question: Question) => `<div>${question.id}</div>`,
          classifyQuestionError,
        },
      }),
    ).rejects.toBe(infrastructureError);
    expect(classifyQuestionError).not.toHaveBeenCalled();
  });

  it('keeps the HTML-array API fail-fast even when the adapter has a classifier', async () => {
    const assessment = { id: 'assessment-1' };
    const assessmentInstance = { id: 'instance-1' };
    const question = { id: 'question-1', type: 'essay' };
    const renderError = new Error('broken question');
    const classifyQuestionError = vi.fn(() => ({ code: 'broken-question' }));

    await expect(
      renderAssessmentInstanceQuestions({
        assessment,
        assessmentInstance,
        adapter: {
          ...createAdapter(assessmentInstance, [question]),
          renderQuestion: () => {
            throw renderError;
          },
          classifyQuestionError,
        },
      }),
    ).rejects.toBe(renderError);
    expect(classifyQuestionError).not.toHaveBeenCalled();
  });
});
