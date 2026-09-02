import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderAssessmentInstanceQuestionsForPrinting } from './printing.js';
import type { ResLocalsForPage } from './res-locals.js';

const mocks = vi.hoisted(() => ({
  getAndRenderVariant: vi.fn(async (..._args: unknown[]) => ({})),
  queryRows: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}));

vi.mock('@prairielearn/postgres', () => ({
  loadSqlEquiv: () => ({ select_questions_for_printing: 'select_questions_for_printing' }),
  queryRows: mocks.queryRows,
}));

vi.mock('./question-render.js', () => ({
  getAndRenderVariant: mocks.getAndRenderVariant,
}));

vi.mock('../components/QuestionContainer.js', () => ({
  QuestionContainer: ({
    resLocals,
  }: {
    resLocals: {
      question: { id: string };
      questionHtml: string;
      answerHtml: string;
      showCorrectAnswer: boolean;
    };
  }) => ({
    toString: () =>
      `<div id="answer">${resLocals.questionHtml}</div>` +
      (resLocals.showCorrectAnswer ? `<div id="correct-answer">${resLocals.answerHtml}</div>` : ''),
  }),
}));

const questions = [
  {
    instance_question: { id: '101' },
    assessment_question: { id: '301', max_points: 2 },
    question: { id: '201', qid: 'includes-fallback-text', type: 'Freeform' },
    question_number: '1',
    question_access_mode: 'normal',
  },
  {
    instance_question: { id: '102' },
    assessment_question: { id: '302', max_points: 5 },
    question: { id: '202', qid: 'broken-generation', type: 'Calculation' },
    question_number: '2',
    question_access_mode: 'normal',
  },
  {
    instance_question: { id: '103' },
    assessment_question: { id: '303', max_points: null },
    question: { id: '203', qid: 'manual-solution', type: 'Freeform', grading_method: 'Manual' },
    question_number: '3',
    question_access_mode: 'normal',
  },
  {
    instance_question: { id: '104' },
    assessment_question: { id: '304', max_points: 3 },
    question: { id: '204', qid: 'manual-without-solution', type: 'Freeform' },
    question_number: '4',
    question_access_mode: 'normal',
  },
];

const resLocals = {
  urlPrefix: '/pl/course_instance/2',
  authn_user: { id: '1' },
  is_administrator: true,
  course: { id: '1' },
  course_instance: { id: '2' },
  assessment: { id: '3' },
  assessment_instance: { id: '4' },
  user: { id: '1' },
  authz_data: {},
  authz_result: {},
} as unknown as ResLocalsForPage<'assessment-instance'>;

describe('renderAssessmentInstanceQuestionsForPrinting', () => {
  beforeEach(() => {
    mocks.queryRows.mockReset();
    mocks.queryRows.mockResolvedValue(questions);
    mocks.getAndRenderVariant.mockReset();
    mocks.getAndRenderVariant.mockImplementation(async (...args: unknown[]) => {
      const renderLocals = args[2] as { question: { id: string } };
      const questionId = renderLocals.question.id;
      const broken = questionId === '202';
      const questionRenderContext = (args[3] as { questionRenderContext?: 'manual_grading' })
        .questionRenderContext;
      return {
        variant: {
          id: `variant-${questionId}`,
          broken_at: broken ? new Date('2026-09-01T12:00:00Z') : null,
        },
        issues: broken ? [{ id: 'issue-202' }] : [],
        extraHeadersHtml: `<link data-question-id="${questionId}">`,
        questionHtml:
          questionId === '201'
            ? 'Broken question due to error in question code'
            : `Question ${questionId}`,
        answerHtml:
          questionId === '203' && questionRenderContext === 'manual_grading'
            ? 'Manual grading answer 203'
            : questionId === '203' || questionId === '204'
              ? ''
              : `Correct answer ${questionId}`,
        showCorrectAnswer:
          (args[3] as { renderMode?: 'default' | 'blank' | 'answer-key' }).renderMode ===
          'answer-key',
      };
    });
  });

  it('excludes canonically broken variants and retains safe ordered result metadata', async () => {
    const result = await renderAssessmentInstanceQuestionsForPrinting(resLocals);

    expect(result.questionHtmls).toHaveLength(3);
    expect(result.questionHtmls[0]).toContain('Broken question due to error in question code');
    expect(result.questionHtmls[0]).toContain('printing-iq-101-answer');
    expect(result.questionHtmls[1]).toContain('printing-iq-103-answer');
    expect(result.questionHtmls[2]).toContain('printing-iq-104-answer');
    expect(result.questionHtmls.join('')).not.toContain('printing-iq-102');

    expect(result.questionResults).toEqual([
      {
        status: 'rendered',
        questionNumber: '1',
        questionId: '201',
        qid: 'includes-fallback-text',
        assessmentQuestionId: '301',
        instanceQuestionId: '101',
        questionType: 'Freeform',
      },
      {
        status: 'failed',
        questionNumber: '2',
        questionId: '202',
        qid: 'broken-generation',
        assessmentQuestionId: '302',
        instanceQuestionId: '102',
        questionType: 'Calculation',
        code: 'broken_variant',
        stage: 'variant_creation',
        message: 'Question could not be rendered due to an error in question code.',
        variantId: 'variant-202',
        issueIds: ['issue-202'],
      },
      {
        status: 'rendered',
        questionNumber: '3',
        questionId: '203',
        qid: 'manual-solution',
        assessmentQuestionId: '303',
        instanceQuestionId: '103',
        questionType: 'Freeform',
      },
      {
        status: 'rendered',
        questionNumber: '4',
        questionId: '204',
        qid: 'manual-without-solution',
        assessmentQuestionId: '304',
        instanceQuestionId: '104',
        questionType: 'Freeform',
      },
    ]);
    expect(result.extraHeadersHtml).toContain('data-question-id="201"');
    expect(result.extraHeadersHtml).toContain('data-question-id="203"');
    expect(result.extraHeadersHtml).toContain('data-question-id="204"');
    expect(result.extraHeadersHtml).not.toContain('data-question-id="202"');
    expect(result.hasLegacyQuestions).toBe(false);
    expect(result.maxPoints).toBe(5);
    expect(mocks.getAndRenderVariant).toHaveBeenCalledTimes(4);
    for (const invocation of mocks.getAndRenderVariant.mock.calls) {
      expect(invocation[0]).toBeNull();
      expect(invocation[1]).toBeNull();
      expect(invocation[3]).toMatchObject({
        issuesLoadExtraData: false,
        renderMode: 'blank',
      });
    }
  });

  it('renders an answer key from the same assessment-instance variants without submissions', async () => {
    const result = await renderAssessmentInstanceQuestionsForPrinting(resLocals, {
      document: 'answer_key',
    });

    expect(result.questionHtmls).toHaveLength(3);
    expect(result.questionHtmls[0]).toContain('Correct answer 201');
    expect(result.questionHtmls[1]).toContain('Manual grading answer 203');
    expect(result.questionHtmls[2]).toContain('No answer key was provided for this question.');
    expect(result.questionHtmls.join('')).not.toContain('Correct answer 202');
    expect(result.questionResults.map((questionResult) => questionResult.status)).toEqual([
      'rendered',
      'failed',
      'rendered',
      'rendered',
    ]);

    expect(mocks.getAndRenderVariant).toHaveBeenCalledTimes(5);
    const initialInvocations = mocks.getAndRenderVariant.mock.calls.filter(
      (invocation) => invocation[0] === null,
    );
    expect(initialInvocations).toHaveLength(4);
    for (const invocation of initialInvocations) {
      expect(invocation[0]).toBeNull();
      expect(invocation[1]).toBeNull();
      expect(invocation[3]).toMatchObject({
        issuesLoadExtraData: false,
        renderMode: 'answer-key',
      });
    }
    expect(mocks.getAndRenderVariant).toHaveBeenCalledWith(
      'variant-203',
      null,
      expect.objectContaining({ question: expect.objectContaining({ id: '203' }) }),
      {
        issuesLoadExtraData: false,
        questionRenderContext: 'manual_grading',
        renderMode: 'answer-key',
      },
    );
  });
});
