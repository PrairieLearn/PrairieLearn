import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

import { HttpStatusError } from '@prairielearn/error';
import { html, unsafeHtml } from '@prairielearn/html';

import { QuestionContainer } from '../../components/QuestionContainer.js';
import { selectPrintFormQuestions } from '../../models/print-form-question.js';
import { getPrintFormUrl } from '../client/url.js';
import { config } from '../config.js';
import { FatalQuestionRenderError, getAndRenderVariant } from '../question-render.js';
import type { ResLocalsForPage } from '../res-locals.js';

import { combineQuestionHeaders } from './combine-question-headers.js';
import { namespaceQuestionHtmls } from './namespace-question-htmls.js';
import { PrintRenderer } from './print-renderer.js';
import type { PrintablePageOutput } from './printable-page-output.js';
import type { QuestionBlockSize } from './question-block-size.js';
import { RenderQueue } from './render-queue.js';

type PrintableQuestion = Awaited<ReturnType<typeof selectPrintFormQuestions>>[number];

const BROKEN_QUESTION_FAILURE_CODE = 'broken_variant';
const QUESTION_RENDER_FAILURE_CODE = 'render_error';
// v2 questions render in the browser with question-specific JavaScript, which printing can't run.
const UNSUPPORTED_QUESTION_FAILURE_CODE = 'unsupported_question_type';

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
export function assertPrintDocumentReady(state: {
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

// Snapshot metadata is client-editable. These checks detect incomplete exports;
// authorization and asset access are enforced separately by the print routes.
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
  code: FailedPrintingQuestionResult['code'];
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
          result.code === UNSUPPORTED_QUESTION_FAILURE_CODE
            ? `${label} uses an older question format that can't be printed and is omitted from the printable documents.`
            : `${label} could not be rendered due to an error in question code and is omitted from the printable documents.`,
      },
    ];
  });
}

interface PrintingQuestionResultBase {
  questionNumber: string;
  qid: string | null;
  printFormQuestionId: string;
}

export type PrintingQuestionResult =
  | (PrintingQuestionResultBase & {
      status: 'rendered';
    })
  | FailedPrintingQuestionResult;

type FailedPrintingQuestionResult = PrintingQuestionResultBase & {
  status: 'failed';
  code:
    | typeof BROKEN_QUESTION_FAILURE_CODE
    | typeof QUESTION_RENDER_FAILURE_CODE
    | typeof UNSUPPORTED_QUESTION_FAILURE_CODE;
};

function assertQuestionBlockSizeOverridesExist(
  questions: PrintableQuestion[],
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>,
) {
  const questionNumbers = new Set(
    questions.map((question) => question.print_form_question.question_number),
  );
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

  const questionNumbers = new Set(
    questions.map((question) => question.print_form_question.question_number),
  );
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
    (question) => !excludedQuestionNumbers.has(question.print_form_question.question_number),
  );
  if (includedQuestions.length === 0) {
    throw new HttpStatusError(400, 'Include at least one question in the printable assessment');
  }
  return includedQuestions;
}

function digestPrintableQuestions(questions: PrintableQuestion[]): string {
  const identities = questions.map(({ print_form_question, question }) => [
    print_form_question.id,
    print_form_question.assessment_question_id,
    print_form_question.variant_id,
    print_form_question.position,
    print_form_question.question_number,
    print_form_question.max_points,
    question.id,
  ]);
  return createHash('sha256').update(JSON.stringify(identities)).digest('hex');
}

export async function getPrintableQuestionListDigest(
  printFormId: string,
  excludedQuestionNumbers: ReadonlySet<string>,
): Promise<string> {
  const questions = await selectPrintFormQuestions(printFormId);
  return digestPrintableQuestions(selectIncludedQuestions(questions, excludedQuestionNumbers));
}

/** Validates a Word export's layout against the form and returns the included question IDs. */
export async function getPrintableFormQuestionIds(
  printFormId: string,
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>,
  excludedQuestionNumbers: ReadonlySet<string>,
): Promise<string[]> {
  const questions = await selectPrintFormQuestions(printFormId);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
  return selectIncludedQuestions(questions, excludedQuestionNumbers).map(
    ({ print_form_question }) => print_form_question.id,
  );
}

export interface RenderPrintFormQuestionsOptions {
  /** Stops queueing and preparing questions once the request is aborted. */
  signal: AbortSignal;
  defaultQuestionBlockSize?: QuestionBlockSize;
  questionBlockSizeOverrides?: ReadonlyMap<string, QuestionBlockSize>;
  excludedQuestionNumbers?: ReadonlySet<string>;
  document?: PrintDocument;
}

async function renderPrintFormQuestionsUnbounded(
  resLocals: ResLocalsForPage<'print-form'>,
  {
    signal,
    defaultQuestionBlockSize = 'auto',
    questionBlockSizeOverrides = new Map(),
    excludedQuestionNumbers = new Set(),
    document = 'assessment',
  }: RenderPrintFormQuestionsOptions,
): Promise<{
  questionHtmls: string[];
  questionListDigest: string;
  questionResults: PrintingQuestionResult[];
  extraHeadersHtml: string;
  maxPoints: number;
}> {
  const questions = await selectPrintFormQuestions(resLocals.print_form.id);
  assertQuestionBlockSizeOverridesExist(questions, questionBlockSizeOverrides);
  const includedQuestions = selectIncludedQuestions(questions, excludedQuestionNumbers);
  const extraHeaderHtmls: string[] = [];
  const renderedQuestions: { html: string; namespace: string }[] = [];
  const questionResults: PrintingQuestionResult[] = [];
  let maxPoints = 0;

  for (const printableQuestion of includedQuestions) {
    signal.throwIfAborted();
    const base: PrintingQuestionResultBase = {
      questionNumber: printableQuestion.print_form_question.question_number,
      qid: printableQuestion.question.qid,
      printFormQuestionId: printableQuestion.print_form_question.id,
    };
    if (printableQuestion.question.type !== 'Freeform') {
      questionResults.push({ ...base, status: 'failed', code: UNSUPPORTED_QUESTION_FAILURE_CODE });
      continue;
    }
    const renderLocals = {
      urlPrefix: resLocals.urlPrefix,
      authn_user: resLocals.authn_user,
      is_administrator: resLocals.is_administrator,
      course: resLocals.course,
      course_instance: resLocals.course_instance,
      assessment: resLocals.assessment,
      assessment_question: printableQuestion.assessment_question,
      question: printableQuestion.question,
      user: resLocals.user,
      authz_data: resLocals.authz_data,
      authz_result: resLocals.authz_result,
    };
    const questionUrl = `${getPrintFormUrl({
      courseInstanceId: resLocals.course_instance.id,
      assessmentId: resLocals.assessment.id,
      printFormId: resLocals.print_form.id,
    })}/question/${printableQuestion.print_form_question.id}`;
    const urlOverrides = {
      questionUrl: `${questionUrl}/`,
      clientFilesQuestionUrl: `${questionUrl}/clientFilesQuestion`,
      clientFilesCourseUrl: `${questionUrl}/clientFilesCourse`,
      clientFilesQuestionGeneratedFileUrl: `${questionUrl}/generatedFilesQuestion/variant/${printableQuestion.print_form_question.variant_id}`,
    };
    try {
      const renderState = await getAndRenderVariant(
        printableQuestion.print_form_question.variant_id,
        null,
        renderLocals,
        {
          urlOverrides,
          printFormQuestionId: printableQuestion.print_form_question.id,
          includeSubmissions: false,
          showCorrectAnswer: document === 'answer_key',
          throwOnFatalError: true,
          issuesLoadExtraData: false,
        },
      );

      if (renderState.variant.broken_at != null) {
        questionResults.push({
          ...base,
          status: 'failed',
          code: BROKEN_QUESTION_FAILURE_CODE,
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
            urlOverrides,
            printFormQuestionId: printableQuestion.print_form_question.id,
            includeSubmissions: false,
            showCorrectAnswer: true,
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
        questionNumber: printableQuestion.print_form_question.question_number,
        showFooter: false,
      }).toString();

      renderedQuestions.push({
        namespace: `printing-pfq-${printableQuestion.print_form_question.id}`,
        html: html`
          <section
            class="printing-question printing-question-freeform"
            data-print-block-size="${questionBlockSizeOverrides.get(printableQuestion.print_form_question.question_number) ?? defaultQuestionBlockSize}"
            data-question-number="${printableQuestion.print_form_question.question_number}"
            aria-label="Question ${printableQuestion.print_form_question.question_number}"
          >
            ${unsafeHtml(questionHtml)}
          </section>
        `.toString(),
      });
      questionResults.push({ ...base, status: 'rendered' });
      maxPoints += printableQuestion.print_form_question.max_points;
    } catch (error) {
      if (!(error instanceof FatalQuestionRenderError)) throw error;
      questionResults.push({
        ...base,
        status: 'failed',
        code: QUESTION_RENDER_FAILURE_CODE,
      });
    }
  }

  return {
    questionHtmls: await namespaceQuestionHtmls(renderedQuestions),
    questionListDigest: digestPrintableQuestions(includedQuestions),
    questionResults,
    extraHeadersHtml: combineQuestionHeaders(extraHeaderHtmls),
    maxPoints,
  };
}

/** Limit question preparation as well as browser pagination during a preview burst. */
export async function renderPrintFormQuestions(
  resLocals: ResLocalsForPage<'print-form'>,
  options: RenderPrintFormQuestionsOptions,
) {
  return await questionPreparationQueue.run(
    async () => await renderPrintFormQuestionsUnbounded(resLocals, options),
    0,
    'print preview',
    options.signal,
  );
}
