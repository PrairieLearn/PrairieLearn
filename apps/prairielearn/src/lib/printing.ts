import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { html, unsafeHtml } from '@prairielearn/html';
import * as sqldb from '@prairielearn/postgres';
import {
  type AssessmentInstancePrintingAdapter,
  type QuestionBlockSize,
  type QuestionTransformer,
  namespaceQuestionHtmls,
  renderAssessmentInstanceQuestionsReport,
} from '@prairielearn/printing';

import { QuestionContainer } from '../components/QuestionContainer.js';

import {
  type Assessment,
  type AssessmentInstance,
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  type Question,
  QuestionSchema,
  SprocQuestionOrderSchema,
} from './db-types.js';
import { getAndRenderVariant } from './question-render.js';
import type { ResLocalsForPage } from './res-locals.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const PrintableQuestionSchema = z.object({
  instance_question: InstanceQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  question_number: SprocQuestionOrderSchema.shape.question_number,
  question_access_mode: SprocQuestionOrderSchema.shape.question_access_mode,
});

type PrintableQuestion = z.infer<typeof PrintableQuestionSchema>;
type PrintableQuestionType = NonNullable<Question['type']> | 'Unknown';
type PrintingQuestionTransformer = QuestionTransformer<
  Assessment,
  AssessmentInstance,
  PrintableQuestion,
  PrintableQuestionType
>;

const BROKEN_QUESTION_FAILURE_CODE = 'broken_variant';
const BROKEN_QUESTION_FAILURE_STAGE = 'variant_creation';
const BROKEN_QUESTION_FAILURE_MESSAGE =
  'Question could not be rendered due to an error in question code.';

export const PRINT_DOCUMENTS = ['exam', 'answer_key'] as const;
export type PrintDocument = (typeof PRINT_DOCUMENTS)[number];

class BrokenQuestionForPrintingError extends Error {
  constructor(
    readonly variantId: string,
    readonly issueIds: string[],
  ) {
    super(BROKEN_QUESTION_FAILURE_MESSAGE);
    this.name = 'BrokenQuestionForPrintingError';
  }
}

interface BrokenQuestionFailure {
  code: typeof BROKEN_QUESTION_FAILURE_CODE;
  stage: typeof BROKEN_QUESTION_FAILURE_STAGE;
  message: string;
  variantId: string;
  issueIds: string[];
}

interface PrintingQuestionResultBase {
  questionNumber: string;
  questionId: string;
  qid: string | null;
  assessmentQuestionId: string;
  instanceQuestionId: string;
  questionType: PrintableQuestionType;
}

export type PrintingQuestionResult =
  | (PrintingQuestionResultBase & {
      status: 'rendered';
    })
  | (PrintingQuestionResultBase & {
      status: 'failed';
      code: typeof BROKEN_QUESTION_FAILURE_CODE;
      stage: typeof BROKEN_QUESTION_FAILURE_STAGE;
      message: string;
      variantId: string;
      issueIds: string[];
    });

function questionTransformer(
  type: PrintableQuestionType,
  className: string,
  getBlockSize: (question: PrintableQuestion) => QuestionBlockSize,
): PrintingQuestionTransformer {
  return ({ html: questionHtml, question }) =>
    html`
      <section
        class="printing-question printing-question-${className}"
        data-question-type="${type}"
        data-print-block-size="${getBlockSize(question)}"
        data-question-number="${question.question_number}"
        data-question-id="${question.question.id}"
        data-instance-question-id="${question.instance_question.id}"
        aria-label="Question ${question.question_number}"
      >
        ${unsafeHtml(questionHtml)}
      </section>
    `.toString();
}

function createQuestionTransformers(
  getBlockSize: (question: PrintableQuestion) => QuestionBlockSize,
) {
  const questionTransformersByType = {
    Calculation: questionTransformer('Calculation', 'calculation', getBlockSize),
    MultipleChoice: questionTransformer('MultipleChoice', 'multiple-choice', getBlockSize),
    Checkbox: questionTransformer('Checkbox', 'checkbox', getBlockSize),
    File: questionTransformer('File', 'file', getBlockSize),
    MultipleTrueFalse: questionTransformer(
      'MultipleTrueFalse',
      'multiple-true-false',
      getBlockSize,
    ),
    Freeform: questionTransformer('Freeform', 'freeform', getBlockSize),
    Unknown: questionTransformer('Unknown', 'unknown', getBlockSize),
  } satisfies Record<PrintableQuestionType, PrintingQuestionTransformer>;

  return new Map<PrintableQuestionType, PrintingQuestionTransformer>(
    Object.entries(questionTransformersByType) as [
      PrintableQuestionType,
      PrintingQuestionTransformer,
    ][],
  );
}

async function selectPrintableQuestions(assessmentInstanceId: string) {
  return await sqldb.queryRows(
    sql.select_questions_for_printing,
    { assessment_instance_id: assessmentInstanceId },
    PrintableQuestionSchema,
  );
}

function assertQuestionBlockSizeOverridesExist(
  questions: PrintableQuestion[],
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>,
) {
  const questionNumbers = new Set(questions.map((question) => question.question_number));
  const unknownQuestionNumbers = [...questionBlockSizeOverrides.keys()].filter(
    (questionNumber) => !questionNumbers.has(questionNumber),
  );
  if (unknownQuestionNumbers.length > 0) {
    const questionNoun =
      unknownQuestionNumbers.length === 1 ? 'question number' : 'question numbers';
    throw new HttpStatusError(
      400,
      `Question block size override references nonexistent ${questionNoun}: ${unknownQuestionNumbers.join(', ')}`,
    );
  }
}

export async function validateQuestionBlockSizeOverridesForPrinting(
  assessmentInstanceId: string,
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>,
): Promise<void> {
  if (questionBlockSizeOverrides.size === 0) return;

  const questions = await selectPrintableQuestions(assessmentInstanceId);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
}

export interface RenderAssessmentInstanceQuestionsForPrintingOptions {
  defaultQuestionBlockSize?: QuestionBlockSize;
  questionBlockSizeOverrides?: ReadonlyMap<string, QuestionBlockSize>;
  document?: PrintDocument;
}

export async function renderAssessmentInstanceQuestionsForPrinting(
  resLocals: ResLocalsForPage<'assessment-instance'>,
  {
    defaultQuestionBlockSize = 'auto',
    questionBlockSizeOverrides = new Map(),
    document = 'exam',
  }: RenderAssessmentInstanceQuestionsForPrintingOptions = {},
): Promise<{
  questionHtmls: string[];
  questionResults: PrintingQuestionResult[];
  extraHeadersHtml: string;
  hasLegacyQuestions: boolean;
  maxPoints: number;
}> {
  const questions = await selectPrintableQuestions(resLocals.assessment_instance.id);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
  const extraHeaderHtmls = new Set<string>();
  const questionTransformers = createQuestionTransformers(
    (question) =>
      questionBlockSizeOverrides.get(question.question_number) ?? defaultQuestionBlockSize,
  );

  const adapter: AssessmentInstancePrintingAdapter<
    Assessment,
    AssessmentInstance,
    PrintableQuestion,
    PrintableQuestionType,
    BrokenQuestionFailure
  > = {
    getQuestions: () => questions,
    getQuestionType: (printableQuestion) => printableQuestion.question.type ?? 'Unknown',
    renderQuestion: async (printableQuestion, assessmentInstance, assessment) => {
      const renderLocals = {
        urlPrefix: resLocals.urlPrefix,
        authn_user: resLocals.authn_user,
        is_administrator: resLocals.is_administrator,
        course: resLocals.course,
        course_instance: resLocals.course_instance,
        assessment,
        assessment_instance: assessmentInstance,
        assessment_question: printableQuestion.assessment_question,
        instance_question: printableQuestion.instance_question,
        instance_question_info: {
          question_number: printableQuestion.question_number,
          question_access_mode: printableQuestion.question_access_mode,
        },
        question: printableQuestion.question,
        user: resLocals.user,
        authz_data: resLocals.authz_data,
        authz_result: resLocals.authz_result,
      };
      const renderState = await getAndRenderVariant(null, null, renderLocals, {
        renderMode: document === 'exam' ? 'blank' : 'answer-key',
        issuesLoadExtraData: false,
      });

      if (renderState.variant.broken_at != null) {
        throw new BrokenQuestionForPrintingError(
          renderState.variant.id,
          renderState.issues.map((issue) => issue.id),
        );
      }

      let answerHtml = renderState.answerHtml;
      let extraHeadersHtml = renderState.extraHeadersHtml;
      if (
        document === 'answer_key' &&
        printableQuestion.question.grading_method === 'Manual' &&
        answerHtml.trim() === ''
      ) {
        const manualGradingRenderState = await getAndRenderVariant(
          renderState.variant.id,
          null,
          renderLocals,
          {
            renderMode: 'answer-key',
            questionRenderContext: 'manual_grading',
            issuesLoadExtraData: false,
          },
        );
        answerHtml = manualGradingRenderState.answerHtml;
        extraHeadersHtml += `\n${manualGradingRenderState.extraHeadersHtml}`;
      }

      for (const extraHeaderHtml of extraHeadersHtml.split('\n')) {
        const trimmedExtraHeaderHtml = extraHeaderHtml.trim();
        if (trimmedExtraHeaderHtml) extraHeaderHtmls.add(trimmedExtraHeaderHtml);
      }

      return QuestionContainer({
        resLocals: {
          ...renderLocals,
          ...renderState,
          answerHtml:
            document === 'answer_key' && answerHtml.trim() === ''
              ? html`<p class="mb-0 text-muted">
                  No answer key was provided for this question.
                </p>`.toString()
              : answerHtml,
          issues: [],
        },
        questionContext: 'student_exam',
        showFooter: false,
      }).toString();
    },
    classifyQuestionError: (error) => {
      if (!(error instanceof BrokenQuestionForPrintingError)) return undefined;
      return {
        code: BROKEN_QUESTION_FAILURE_CODE,
        stage: BROKEN_QUESTION_FAILURE_STAGE,
        message: BROKEN_QUESTION_FAILURE_MESSAGE,
        variantId: error.variantId,
        issueIds: error.issueIds,
      };
    },
  };

  const { questionResults: renderResults } = await renderAssessmentInstanceQuestionsReport<
    Assessment,
    AssessmentInstance,
    PrintableQuestion,
    PrintableQuestionType,
    BrokenQuestionFailure
  >({
    assessment: resLocals.assessment,
    assessmentInstance: resLocals.assessment_instance,
    adapter,
    questionTransformers,
  });
  const renderedQuestions = renderResults.filter((result) => result.status === 'rendered');
  const questionHtmls = namespaceQuestionHtmls(
    renderedQuestions.map((result) => ({
      html: result.html,
      namespace: `printing-iq-${result.question.instance_question.id}`,
    })),
  );
  const questionResults: PrintingQuestionResult[] = renderResults.map((result) => {
    const questionType = result.questionType ?? result.question.question.type ?? 'Unknown';
    const base = {
      questionNumber: result.question.question_number,
      questionId: result.question.question.id,
      qid: result.question.question.qid,
      assessmentQuestionId: result.question.assessment_question.id,
      instanceQuestionId: result.question.instance_question.id,
      questionType,
    };

    if (result.status === 'rendered') return { ...base, status: 'rendered' };
    return {
      ...base,
      status: 'failed',
      code: result.failure.code,
      stage: result.failure.stage,
      message: result.failure.message,
      variantId: result.failure.variantId,
      issueIds: result.failure.issueIds,
    };
  });
  const hasLegacyQuestions = renderedQuestions.some(
    (result) => result.question.question.type !== 'Freeform',
  );
  const maxPoints = renderedQuestions.reduce(
    (sum, result) => sum + (result.question.assessment_question.max_points ?? 0),
    0,
  );

  return {
    questionHtmls,
    questionResults,
    extraHeadersHtml: [...extraHeaderHtmls].join('\n'),
    hasLegacyQuestions,
    maxPoints,
  };
}
