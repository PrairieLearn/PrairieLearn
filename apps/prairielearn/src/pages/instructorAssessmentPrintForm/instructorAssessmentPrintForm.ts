import { type ErrorRequestHandler, Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams, parseRequestQuery } from '@prairielearn/zod';

import {
  PrintGradingTableSchema,
  PrintIdentityFieldsSchema,
} from '../../lib/client/printing/print-cover.js';
import { config } from '../../lib/config.js';
import { DocxSourceSchema } from '../../lib/printing/docx-source-schema.js';
import {
  PRINT_DOCUMENTS,
  describeOmittedQuestions,
  getPrintRenderer,
  isBrowserRenderingAvailable,
  renderPrintFormQuestions,
} from '../../lib/printing/index.js';
import { PAPER_SIZES, type PaperSize } from '../../lib/printing/paper-size.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import { createPrintFormQuestionAssetRouter } from '../../lib/printing/print-asset-routes.js';
import {
  buildPrintableCover,
  getPrintCoverHtml,
  getPrintFooter,
} from '../../lib/printing/print-cover.js';
import { serializePrintDocument } from '../../lib/printing/print-document.js';
import { startPrintRequest } from '../../lib/printing/print-request.js';
import { printSnapshotLayout, storePrintSnapshot } from '../../lib/printing/print-snapshots.js';
import {
  QUESTION_BLOCK_SIZES,
  type QuestionBlockSize,
} from '../../lib/printing/question-block-size.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import authzHasCoursePreview from '../../middlewares/authzHasCoursePreview.js';
import { requirePrintingAvailable } from '../../middlewares/requirePrintingAvailable.js';
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

const LayoutQuerySchema = z.strictObject({
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

const router = Router({ mergeParams: true });

router.use(requirePrintingAvailable);

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
        'Print previews and downloads are unavailable right now. Contact PrairieLearn support.',
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
    const { assessmentTextHtml, honorCodeHtml } = getPrintCoverHtml(
      res.locals.assessment,
      res.locals.urlPrefix,
    );
    const includeHonorCode =
      layout.includeHonorCode ?? res.locals.assessment.require_honor_code ?? false;
    const warnings = describeOmittedQuestions(printingResult.questionResults);

    const rawHtml = InstructorAssessmentPrintForm({
      resLocals: res.locals,
      paperSize: layout.paperSize,
      includeCoverPage: layout.includeCoverPage,
      includeGradingTable: layout.includeGradingTable,
      includeHonorCode,
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
    const { html, source, summary, gradingTable } = await getPrintRenderer().render(
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
          const { source, data } = await page.evaluate(() => ({
            source: Reflect.get(window, '__PL_PRINT_DOCX_SOURCE__'),
            data: { ...window.document.documentElement.dataset },
          }));
          if (!source) {
            throw new Error('The preview did not capture editable question content.');
          }
          return {
            html: await page.locator(':root').evaluate(serializePrintDocument),
            source: DocxSourceSchema.parse(source),
            summary: {
              questionCount: Number(data.printQuestionCount),
              omittedQuestionCount: Number(data.printOmittedQuestionCount),
              pageCount: Number(data.printPageCount),
            },
            gradingTable: data.printGradingTable
              ? PrintGradingTableSchema.parse(JSON.parse(data.printGradingTable))
              : undefined,
          };
        },
      },
    );
    // Only course editors can export, so only their previews are kept for exports.
    if (res.locals.authz_data.has_course_permission_edit) {
      const formLabel = res.locals.print_form.label;
      await storePrintSnapshot(
        {
          printForm: res.locals.print_form,
          courseCommitHash: res.locals.course.commit_hash,
          document,
          authnUserId: res.locals.authn_user.id,
          userId: res.locals.user.id,
          layout: printSnapshotLayout(localPreviewUrl.searchParams),
          questionListDigest: printingResult.questionListDigest,
        },
        {
          html,
          docx: {
            source,
            cover: layout.includeCoverPage
              ? buildPrintableCover({
                  resLocals: res.locals,
                  document,
                  formLabel,
                  identityFields: layout.identityFields,
                  questionCount: summary.questionCount,
                  maxPoints: printingResult.maxPoints,
                  assessmentTextHtml,
                  honorCodeHtml,
                  includeHonorCode,
                  gradingTable,
                })
              : undefined,
            footer: getPrintFooter({ resLocals: res.locals, document, formLabel }),
          },
        },
        summary,
      );
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self';",
    );
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  }),
);

// A disconnected print request, e.g. a preview reloaded after a layout change, has nobody left
// to answer, so its cancellation isn't an error worth reporting.
router.use(((err, _req, res, next) => {
  if (res.destroyed) return;
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
