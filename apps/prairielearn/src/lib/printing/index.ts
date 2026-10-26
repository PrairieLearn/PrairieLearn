import { existsSync } from 'node:fs';

import { chromium } from 'playwright';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { html, unsafeHtml } from '@prairielearn/html';
import * as sqldb from '@prairielearn/postgres';

import { QuestionContainer } from '../../components/QuestionContainer.js';
import { config } from '../config.js';
import {
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  SprocQuestionOrderSchema,
} from '../db-types.js';
import { getAndRenderVariant } from '../question-render.js';
import type { ResLocalsForPage } from '../res-locals.js';

import { combineQuestionHeaders } from './combine-question-headers.js';
import { namespaceQuestionHtmls } from './namespace-question-htmls.js';
import { PrintRenderer } from './print-renderer.js';
import type { PrintablePageOutput } from './printable-page-output.js';
import type { QuestionBlockSize } from './question-block-size.js';
import { RenderQueue } from './render-queue.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const PrintableQuestionSchema = z.object({
  instance_question: InstanceQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  question_number: SprocQuestionOrderSchema.shape.question_number,
  question_access_mode: SprocQuestionOrderSchema.shape.question_access_mode,
});

type PrintableQuestion = z.infer<typeof PrintableQuestionSchema>;

const BROKEN_QUESTION_FAILURE_CODE = 'broken_variant';
const BROKEN_QUESTION_FAILURE_STAGE = 'variant_creation';
const BROKEN_QUESTION_FAILURE_MESSAGE =
  'Question could not be rendered due to an error in question code.';
const UNSUPPORTED_QUESTION_CODE = 'unsupported_question_type';

export const PRINT_DOCUMENTS = ['assessment', 'answer_key'] as const;
export type PrintDocument = (typeof PRINT_DOCUMENTS)[number];

let printRenderer: PrintRenderer | null = null;
const questionPreparationQueue = new RenderQueue(4, 50);

/**
 * The process-wide renderer reuses one browser connection and bounds concurrent print jobs.
 */
export function getPrintRenderer(): PrintRenderer {
  printRenderer ??= new PrintRenderer({
    cloudflare:
      config.printingCloudflareAccountId && config.printingCloudflareApiToken
        ? {
            accountId: config.printingCloudflareAccountId,
            apiToken: config.printingCloudflareApiToken,
          }
        : undefined,
  });
  return printRenderer;
}

export async function closePrintRenderer(): Promise<void> {
  questionPreparationQueue.rejectAll(new Error('Print preparation is shutting down'));
  const renderer = printRenderer;
  printRenderer = null;
  await renderer?.close();
}

/** Export only when a remote browser or the matching local Chromium build is installed. */
export function isBrowserRenderingAvailable(): boolean {
  return (
    Boolean(config.printingCloudflareAccountId && config.printingCloudflareApiToken) ||
    existsSync(chromium.executablePath())
  );
}

/** Previews may omit broken questions for review; downloads must include every selected question. */
function assertPrintDocumentReady(state: {
  questionCount: number;
  omittedCount: number;
  coverPageCount: number;
  document: string | undefined;
  formLabel: string | undefined;
}): void {
  if (!state.questionCount || state.omittedCount || state.coverPageCount < 0) {
    let label = state.formLabel ? `Form ${state.formLabel}` : 'This assessment';
    if (state.document === 'answer_key') {
      label = state.formLabel ? `The answer key for ${label}` : 'This answer key';
    }
    throw new HttpStatusError(
      400,
      `${label} has missing or unprintable questions. Review its preview and exclude or fix those questions before exporting.`,
    );
  }
}

export const validatePrintDocument: PrintablePageOutput<{
  coverPageCount: number;
}>['produce'] = async (page) => {
  const state = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('.pagedjs_page')];
    const data = document.documentElement.dataset;
    return {
      questionCount: Number(data.printQuestionCount),
      omittedCount: Number(data.printOmittedQuestionCount),
      coverPageCount: sheets.findIndex((sheet) => sheet.querySelector('.printing-question')),
      document: data.printDocument,
      formLabel: data.printFormLabel,
    };
  });
  assertPrintDocumentReady(state);
  return { coverPageCount: state.coverPageCount };
};

export interface OmittedQuestionWarning {
  code: typeof BROKEN_QUESTION_FAILURE_CODE | typeof UNSUPPORTED_QUESTION_CODE;
  question_number: string;
  qid: string | null;
  message: string;
}

/** Describes the questions that were left out of a printable document, for the instructor. */
export function describeOmittedQuestions(
  questionResults: PrintingQuestionResult[],
): OmittedQuestionWarning[] {
  return questionResults.flatMap((result) => {
    if (result.status === 'rendered') return [];
    const label = result.qid
      ? `Question ${result.questionNumber} (${result.qid})`
      : `Question ${result.questionNumber}`;
    return [
      {
        code: result.code,
        question_number: result.questionNumber,
        qid: result.qid,
        message:
          result.status === 'unsupported'
            ? `${label} uses a question type that cannot be printed. Exclude it or replace it with a Freeform question.`
            : `${label} could not be rendered due to an error in question code and is omitted from the printable documents.`,
      },
    ];
  });
}

interface PrintingQuestionResultBase {
  questionNumber: string;
  questionId: string;
  qid: string | null;
  assessmentQuestionId: string;
  instanceQuestionId: string;
}

export type PrintingQuestionResult =
  | (PrintingQuestionResultBase & {
      status: 'rendered';
    })
  | (PrintingQuestionResultBase & {
      status: 'unsupported';
      code: typeof UNSUPPORTED_QUESTION_CODE;
    })
  | (PrintingQuestionResultBase & {
      status: 'failed';
      code: typeof BROKEN_QUESTION_FAILURE_CODE;
      stage: typeof BROKEN_QUESTION_FAILURE_STAGE;
      message: string;
      variantId: string;
      issueIds: string[];
    });

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

function selectIncludedQuestions(
  questions: PrintableQuestion[],
  excludedQuestionNumbers: ReadonlySet<string>,
) {
  if (excludedQuestionNumbers.size === 0) return questions;

  const questionNumbers = new Set(questions.map((question) => question.question_number));
  const unknownQuestionNumbers = [...excludedQuestionNumbers].filter(
    (questionNumber) => !questionNumbers.has(questionNumber),
  );
  if (unknownQuestionNumbers.length > 0) {
    throw new HttpStatusError(
      400,
      `Question exclusion references nonexistent question numbers: ${unknownQuestionNumbers.join(', ')}`,
    );
  }
  const includedQuestions = questions.filter(
    (question) => !excludedQuestionNumbers.has(question.question_number),
  );
  if (includedQuestions.length === 0) {
    throw new HttpStatusError(400, 'Include at least one question in the printable assessment');
  }
  return includedQuestions;
}

export async function validateQuestionsForPrinting(
  assessmentInstanceId: string,
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>,
  excludedQuestionNumbers: ReadonlySet<string>,
): Promise<void> {
  if (questionBlockSizeOverrides.size === 0 && excludedQuestionNumbers.size === 0) return;

  const questions = await selectPrintableQuestions(assessmentInstanceId);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
  selectIncludedQuestions(questions, excludedQuestionNumbers);
}

export interface RenderAssessmentInstanceQuestionsForPrintingOptions {
  defaultQuestionBlockSize?: QuestionBlockSize;
  questionBlockSizeOverrides?: ReadonlyMap<string, QuestionBlockSize>;
  excludedQuestionNumbers?: ReadonlySet<string>;
  document?: PrintDocument;
}

async function renderAssessmentInstanceQuestionsUnbounded(
  resLocals: ResLocalsForPage<'assessment-instance'>,
  {
    defaultQuestionBlockSize = 'auto',
    questionBlockSizeOverrides = new Map(),
    excludedQuestionNumbers = new Set(),
    document = 'assessment',
  }: RenderAssessmentInstanceQuestionsForPrintingOptions = {},
): Promise<{
  questionHtmls: string[];
  questionResults: PrintingQuestionResult[];
  extraHeadersHtml: string;
  maxPoints: number;
}> {
  const questions = await selectPrintableQuestions(resLocals.assessment_instance.id);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
  const includedQuestions = selectIncludedQuestions(questions, excludedQuestionNumbers);
  const extraHeaderHtmls: string[] = [];
  const renderedQuestions: { html: string; namespace: string }[] = [];
  const questionResults: PrintingQuestionResult[] = [];
  let maxPoints = 0;

  for (const printableQuestion of includedQuestions) {
    const base: PrintingQuestionResultBase = {
      questionNumber: printableQuestion.question_number,
      questionId: printableQuestion.question.id,
      qid: printableQuestion.question.qid,
      assessmentQuestionId: printableQuestion.assessment_question.id,
      instanceQuestionId: printableQuestion.instance_question.id,
    };
    if (printableQuestion.question.type !== 'Freeform') {
      questionResults.push({ ...base, status: 'unsupported', code: UNSUPPORTED_QUESTION_CODE });
      continue;
    }
    const renderLocals = {
      urlPrefix: resLocals.urlPrefix,
      authn_user: resLocals.authn_user,
      is_administrator: resLocals.is_administrator,
      course: resLocals.course,
      course_instance: resLocals.course_instance,
      assessment: resLocals.assessment,
      assessment_instance: resLocals.assessment_instance,
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
      includeSubmissions: false,
      showCorrectAnswer: document === 'answer_key',
      // Printed copies and answer keys must reuse saved variants, including closed homework variants.
      requireOpenVariant: false,
      throwOnFatalError: true,
      issuesLoadExtraData: false,
    });

    if (renderState.variant.broken_at != null) {
      questionResults.push({
        ...base,
        status: 'failed',
        code: BROKEN_QUESTION_FAILURE_CODE,
        stage: BROKEN_QUESTION_FAILURE_STAGE,
        message: BROKEN_QUESTION_FAILURE_MESSAGE,
        variantId: renderState.variant.id,
        issueIds: renderState.issues.map((issue) => issue.id),
      });
      continue;
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
          includeSubmissions: false,
          showCorrectAnswer: true,
          requireOpenVariant: false,
          throwOnFatalError: true,
          questionRenderContext: 'manual_grading',
          issuesLoadExtraData: false,
        },
      );
      answerHtml = manualGradingRenderState.answerHtml;
      extraHeadersHtml += `\n${manualGradingRenderState.extraHeadersHtml}`;
    }

    extraHeaderHtmls.push(extraHeadersHtml);

    const questionHtml = QuestionContainer({
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

    renderedQuestions.push({
      namespace: `printing-iq-${printableQuestion.instance_question.id}`,
      html: html`
        <section
          class="printing-question printing-question-freeform"
          data-print-block-size="${questionBlockSizeOverrides.get(printableQuestion.question_number) ?? defaultQuestionBlockSize}"
          data-question-number="${printableQuestion.question_number}"
          data-question-id="${printableQuestion.question.id}"
          data-instance-question-id="${printableQuestion.instance_question.id}"
          aria-label="Question ${printableQuestion.question_number}"
        >
          ${unsafeHtml(questionHtml)}
        </section>
      `.toString(),
    });
    questionResults.push({ ...base, status: 'rendered' });
    maxPoints += printableQuestion.assessment_question.max_points ?? 0;
  }

  return {
    questionHtmls: namespaceQuestionHtmls(renderedQuestions),
    questionResults,
    extraHeadersHtml: combineQuestionHeaders(extraHeaderHtmls),
    maxPoints,
  };
}

/** Limit question preparation as well as browser pagination during a preview burst. */
export async function renderAssessmentInstanceQuestionsForPrinting(
  resLocals: ResLocalsForPage<'assessment-instance'>,
  options: RenderAssessmentInstanceQuestionsForPrintingOptions = {},
) {
  return await questionPreparationQueue.run(
    async () => await renderAssessmentInstanceQuestionsUnbounded(resLocals, options),
    120_000,
    'print preview',
  );
}
