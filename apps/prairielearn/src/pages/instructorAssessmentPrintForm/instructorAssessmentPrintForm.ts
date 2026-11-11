import { type ErrorRequestHandler, type RequestHandler, Router, raw } from 'express';
import mustache from 'mustache';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { markdownToHtml } from '@prairielearn/markdown';
import { escapeRegExp } from '@prairielearn/sanitize';
import {
  IdSchema,
  JsonFromStringSchema,
  parseRequest,
  parseRequestParams,
  parseRequestQuery,
} from '@prairielearn/zod';

import { renderText as renderAssessmentText } from '../../lib/assessment.js';
import {
  PrintGradingTableSchema,
  PrintIdentityFieldsSchema,
} from '../../lib/client/printing/print-cover.js';
import { serializePrintDocument } from '../../lib/client/printing/print-document.js';
import { MAX_PRINT_SNAPSHOT_BYTES } from '../../lib/client/printing/print-snapshot-limits.js';
import { config } from '../../lib/config.js';
import type { DocxSource } from '../../lib/printing/docx-browser.js';
import { createDocxOutput } from '../../lib/printing/docx-output.js';
import {
  PRINT_DOCUMENTS,
  describeOmittedQuestions,
  getPrintRenderer,
  getPrintableFormQuestionIds,
  isBrowserRenderingAvailable,
  renderPrintFormQuestions,
  validatePrintDocument,
} from '../../lib/printing/index.js';
import { PAPER_SIZES, type PaperSize } from '../../lib/printing/pdf-output.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import { createPrintFormQuestionAssetRouter } from '../../lib/printing/print-asset-routes.js';
import {
  BLANK_NAME_PLACEHOLDER,
  HONOR_CODE_HEADING,
  buildPrintableCover,
  getPrintFooterLabel,
} from '../../lib/printing/print-cover.js';
import { startPrintRequest } from '../../lib/printing/print-request.js';
import {
  QUESTION_BLOCK_SIZES,
  type QuestionBlockSize,
} from '../../lib/printing/question-block-size.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import authzHasCoursePreview from '../../middlewares/authzHasCoursePreview.js';
import { requirePrintableAssessments } from '../../middlewares/requirePrintableAssessments.js';
import { selectOptionalPrintForm } from '../../models/print-form.js';

import { InstructorAssessmentPrintForm } from './instructorAssessmentPrintForm.html.js';

const PrintFormParamsSchema = z.object({ print_form_id: IdSchema });

const QuestionBlockSizeSchema = z.enum(QUESTION_BLOCK_SIZES);
const QuestionNumberSchema = z.string().min(1);
const IdentityFieldsSchema = z
  .union([z.string(), z.string().array()])
  .transform((fields) => (Array.isArray(fields) ? fields : [fields]))
  .pipe(PrintIdentityFieldsSchema)
  .default([]);
const QuestionBlockSizeOverrideSchema = z
  .string()
  .regex(new RegExp(`^.+:(${QUESTION_BLOCK_SIZES.join('|')})$`))
  .transform((value) => {
    const separator = value.lastIndexOf(':');
    return {
      questionNumber: value.slice(0, separator),
      blockSize: QuestionBlockSizeSchema.parse(value.slice(separator + 1)),
    };
  });

const LayoutQuerySchema = z.object({
  paper_size: z.enum(PAPER_SIZES),
  include_honor_code: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  grading_table: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  include_cover: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  identity_field: IdentityFieldsSchema,
  block_size: QuestionBlockSizeSchema.optional(),
  question_block_size: z
    .union([QuestionBlockSizeOverrideSchema, QuestionBlockSizeOverrideSchema.array()])
    .transform((overrides) => (Array.isArray(overrides) ? overrides : [overrides]))
    .default([])
    .refine(
      (overrides) =>
        new Set(overrides.map(({ questionNumber }) => questionNumber)).size === overrides.length,
      'question_block_size may only be specified once for each question',
    ),
  exclude_question: z
    .union([QuestionNumberSchema, QuestionNumberSchema.array()])
    .transform((numbers) => (Array.isArray(numbers) ? numbers : [numbers]))
    .default([])
    .refine(
      (numbers) => new Set(numbers).size === numbers.length,
      'exclude_question may only be specified once for each question',
    ),
});
const DocumentQuerySchema = LayoutQuerySchema.extend({
  document: z.enum(PRINT_DOCUMENTS).default('assessment'),
});
const PrintSnapshotSchema = z.object({
  html: z.string().min(1).max(MAX_PRINT_SNAPSHOT_BYTES),
  source: z.object({
    html: z.string().max(MAX_PRINT_SNAPSHOT_BYTES),
    figures: z.array(
      z.object({
        id: z.string().regex(/^[1-9]\d*$/),
        width: z.number().positive().max(4096),
        height: z.number().positive().max(4096),
        alt: z.string(),
      }),
    ),
  }) satisfies z.ZodType<DocxSource>,
});
const DocxPostRequestSchemas = {
  query: DocumentQuerySchema,
  body: z
    .instanceof(Buffer)
    .transform((body) => body.toString('utf8'))
    .pipe(JsonFromStringSchema)
    .pipe(PrintSnapshotSchema),
};

/** The layout choices shared by every printable output of one printable form. */
interface PrintLayout {
  paperSize: PaperSize;
  includeCoverPage: boolean;
  includeGradingTable: boolean;
  includeHonorCode: boolean | undefined;
  identityFields: string[];
  blockSize: QuestionBlockSize | undefined;
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>;
  excludedQuestionNumbers: ReadonlySet<string>;
}

function parsePrintLayout(query: z.infer<typeof LayoutQuerySchema>): PrintLayout {
  return {
    paperSize: query.paper_size,
    includeCoverPage: query.include_cover,
    includeGradingTable: query.grading_table,
    includeHonorCode: query.include_honor_code,
    identityFields: query.identity_field,
    blockSize: query.block_size,
    questionBlockSizeOverrides: new Map(
      query.question_block_size.map(({ questionNumber, blockSize }) => [questionNumber, blockSize]),
    ),
    excludedQuestionNumbers: new Set(query.exclude_question),
  };
}

function getCoverHtml(resLocals: ResLocalsForPage<'print-form'>) {
  return {
    assessmentTextHtml: renderAssessmentText(resLocals.assessment, resLocals.urlPrefix),
    honorCodeHtml: resLocals.assessment.honor_code
      ? markdownToHtml(
          mustache.render(resLocals.assessment.honor_code, {
            user_name: BLANK_NAME_PLACEHOLDER,
          }),
          { allowHtml: false, interpretMath: false },
        ).replace(new RegExp(`^<h([1-6])>${escapeRegExp(HONOR_CODE_HEADING)}</h\\1>\\s*`, 'i'), '')
      : null,
  };
}

function printAssetScope(
  resLocals: ResLocalsForPage<'print-form'>,
  printFormQuestionIds: string[],
): PrintAssetScope {
  return {
    courseInstanceId: resLocals.course_instance.id,
    assessmentId: resLocals.assessment.id,
    printFormId: resLocals.print_form.id,
    printFormQuestionIds,
    authnUserId: resLocals.authn_user.id,
    userId: resLocals.user.id,
  };
}

const parseDocxBody: RequestHandler = (req, res, next) => {
  if (!req.is('application/octet-stream')) {
    next(new HttpStatusError(415, 'The Word export request has an unsupported format.'));
    return;
  }
  raw({ type: 'application/octet-stream', limit: 16 * 1024 * 1024 })(req, res, next);
};

const router = Router({ mergeParams: true });

router.use(requirePrintableAssessments);

router.use(authzHasCoursePreview);
router.use(
  typedAsyncHandler<'assessment'>(async (req, res, next) => {
    const { print_form_id: printFormId } = parseRequestParams(req, PrintFormParamsSchema);
    const printForm = await selectOptionalPrintForm({
      printFormId,
      assessmentId: res.locals.assessment.id,
    });
    if (!printForm) throw new HttpStatusError(404, 'Printable form not found');
    Object.assign(res.locals, { print_form: printForm });
    next();
  }),
);
router.use('/question/:print_form_question_id(\\d+)', createPrintFormQuestionAssetRouter());

router.get(
  '/preview',
  typedAsyncHandler<'print-form'>(async (req, res) => {
    const { signal, disconnectSignal, remainingTimeoutMs } = startPrintRequest(res);
    const query = parseRequestQuery(req, DocumentQuerySchema);
    const layout = parsePrintLayout(query);
    const { document } = query;

    if (!isBrowserRenderingAvailable()) {
      throw new HttpStatusError(
        404,
        'Printable document rendering is not configured on this server',
      );
    }

    res.setHeader('Content-Security-Policy', "frame-ancestors 'self';");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const printingResult = await renderPrintFormQuestions(res.locals, {
      signal,
      defaultQuestionBlockSize: layout.blockSize ?? 'auto',
      questionBlockSizeOverrides: layout.questionBlockSizeOverrides,
      excludedQuestionNumbers: layout.excludedQuestionNumbers,
      document,
    });
    if (printingResult.questionHtmls.length === 0) {
      throw new HttpStatusError(
        422,
        'No questions could be rendered for this printable assessment',
      );
    }
    const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);
    const warnings = describeOmittedQuestions(printingResult.questionResults);

    const rawHtml = InstructorAssessmentPrintForm({
      resLocals: res.locals,
      paperSize: layout.paperSize,
      includeCoverPage: layout.includeCoverPage,
      includeGradingTable: layout.includeGradingTable,
      includeHonorCode:
        layout.includeHonorCode ?? res.locals.assessment.require_honor_code ?? false,
      document,
      formLabel: res.locals.print_form.label,
      identityFields: layout.identityFields,
      questionHtmls: printingResult.questionHtmls,
      omittedQuestionCount: warnings.length,
      warnings,
      extraHeadersHtml: printingResult.extraHeadersHtml,
      maxPoints: printingResult.maxPoints,
      assessmentTextHtml,
      honorCodeHtml,
    }).toString();
    const localPreviewUrl = new URL(
      req.originalUrl,
      `${config.serverType}://localhost:${config.serverPort}`,
    );
    const { html, source } = await getPrintRenderer().render<{
      html: string;
      source: DocxSource;
    }>(
      {
        url: localPreviewUrl.href,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: rawHtml,
        assetScope: printAssetScope(
          res.locals,
          printingResult.questionResults
            .filter((result) => result.status === 'rendered')
            .map(({ printFormQuestionId }) => printFormQuestionId),
        ),
        runScripts: true,
        signal: disconnectSignal,
        timeoutMs: remainingTimeoutMs(),
      },
      {
        label: 'preview',
        produce: async (page) => {
          const capturedSource = await page.evaluate(() =>
            Reflect.get(window, '__PL_PRINT_DOCX_SOURCE__'),
          );
          if (!capturedSource) {
            throw new Error('The preview did not capture editable question content.');
          }
          const source = PrintSnapshotSchema.shape.source.parse(capturedSource);
          return { html: await page.locator(':root').evaluate(serializePrintDocument), source };
        },
      },
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self';",
    );
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(
      html.replace(
        '</head>',
        () =>
          `<script id="pl-print-docx-source" type="application/json">${JSON.stringify(source).replaceAll('<', '\\u003c')}</script></head>`,
      ),
    );
  }),
);

router.post(
  '/docx',
  parseDocxBody,
  typedAsyncHandler<'print-form'>(async (req, res) => {
    const { disconnectSignal, remainingTimeoutMs } = startPrintRequest(res);
    const { query, body: snapshot } = parseRequest(req, DocxPostRequestSchemas);
    const layout = parsePrintLayout(query);
    const { document } = query;

    if (!isBrowserRenderingAvailable()) {
      throw new HttpStatusError(
        404,
        'Printable document rendering is not configured on this server',
      );
    }

    const printFormQuestionIds = await getPrintableFormQuestionIds(
      res.locals.print_form.id,
      layout.questionBlockSizeOverrides,
      layout.excludedQuestionNumbers,
    );
    const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);
    const footerLabel = getPrintFooterLabel({
      document,
      formLabel: res.locals.print_form.label,
    });
    const makeCover = (
      questionCount: number,
      maxPoints: number,
      gradingTable?: z.infer<typeof PrintGradingTableSchema>,
    ) =>
      buildPrintableCover({
        resLocals: res.locals,
        document,
        formLabel: res.locals.print_form.label,
        identityFields: layout.identityFields,
        questionCount,
        maxPoints,
        assessmentTextHtml,
        honorCodeHtml,
        includeHonorCode:
          layout.includeHonorCode ?? res.locals.assessment.require_honor_code ?? false,
        gradingTable,
      });

    const localPreviewUrl = new URL(
      `${req.baseUrl}/preview`,
      `${config.serverType}://localhost:${config.serverPort}`,
    );
    const output = createDocxOutput({
      source: snapshot.source,
      cover: layout.includeCoverPage
        ? (pageDataset) =>
            makeCover(
              Number(pageDataset.printQuestionCount),
              Number(pageDataset.printMaxPoints),
              pageDataset.printGradingTable
                ? PrintGradingTableSchema.parse(JSON.parse(pageDataset.printGradingTable))
                : undefined,
            )
        : undefined,
      footerLabel,
    });
    const contents = await getPrintRenderer().render(
      {
        url: localPreviewUrl.href,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        assetScope: printAssetScope(res.locals, printFormQuestionIds),
        signal: disconnectSignal,
        timeoutMs: remainingTimeoutMs(),
      },
      {
        ...output,
        produce: async (page) => {
          const identity = await page.evaluate(() => ({
            formId: globalThis.document.documentElement.dataset.printFormId,
            document: globalThis.document.documentElement.dataset.printDocument,
            formLabel: globalThis.document.documentElement.dataset.printFormLabel,
            paperSize: globalThis.document.documentElement.dataset.printPaperSize,
          }));
          if (
            identity.formId !== res.locals.print_form.id ||
            identity.document !== document ||
            identity.formLabel !== res.locals.print_form.label ||
            identity.paperSize !== layout.paperSize
          ) {
            throw new HttpStatusError(
              400,
              'The preview does not match the requested form, document type, form label, or paper size. Generate a new preview before exporting.',
            );
          }
          await validatePrintDocument(page);
          return await output.produce(page);
        },
      },
    );

    const filename =
      assessmentFilenamePrefix(
        res.locals.assessment,
        res.locals.assessment_set,
        res.locals.course_instance,
        res.locals.course,
      ) +
      sanitizeString(
        `form_${res.locals.print_form.id}_${layout.paperSize.toLowerCase()}${
          document === 'answer_key' ? '_answer_key' : ''
        }`,
      ) +
      '.docx';
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(contents);
  }),
);

// A disconnected print request, e.g. a preview reloaded after a layout change, has nobody left
// to answer, so its cancellation isn't an error worth reporting.
router.use(((err, _req, res, next) => {
  if (res.destroyed) return;
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
