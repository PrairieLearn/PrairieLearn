import { type ErrorRequestHandler, type RequestHandler, Router, raw } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  IdSchema,
  JsonFromStringSchema,
  parseRequest,
  parseRequestParams,
  parseRequestQuery,
} from '@prairielearn/zod';

import {
  PrintGradingTableSchema,
  PrintIdentityFieldsSchema,
} from '../../lib/client/printing/print-cover.js';
import { serializePrintDocument } from '../../lib/client/printing/print-document.js';
import { printLayoutSearch } from '../../lib/client/printing/print-preparation.js';
import { MAX_PRINT_SNAPSHOT_BYTES } from '../../lib/client/printing/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/printing/print-snapshot.js';
import { config } from '../../lib/config.js';
import type { DocxSource } from '../../lib/printing/docx-browser.js';
import { DocxSourceSchema } from '../../lib/printing/docx-source-schema.js';
import {
  PRINT_DOCUMENTS,
  assertPrintDocumentReady,
  describeOmittedQuestions,
  getPrintRenderer,
  getPrintableFormQuestions,
  isBrowserRenderingAvailable,
  loadPrintSnapshotRoot,
  renderPrintFormQuestions,
} from '../../lib/printing/index.js';
import { PAPER_SIZES, type PaperSize } from '../../lib/printing/paper-size.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import { createPrintFormQuestionAssetRouter } from '../../lib/printing/print-asset-routes.js';
import {
  buildPrintableCover,
  digestPrintCoverHtml,
  getPrintCoverHtml,
  getPrintFooter,
} from '../../lib/printing/print-cover.js';
import { queuePrintExport } from '../../lib/printing/print-exports.js';
import { startPrintRequest } from '../../lib/printing/print-request.js';
import {
  checkPrintSnapshotId,
  createPrintSnapshotId,
} from '../../lib/printing/print-snapshot-id.js';
import {
  QUESTION_BLOCK_SIZES,
  type QuestionBlockSize,
} from '../../lib/printing/question-block-size.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import authzHasCoursePreview from '../../middlewares/authzHasCoursePreview.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
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
const PrintSnapshotSchema = z.strictObject({
  id: z.string().min(1),
  html: z.string().min(1).max(MAX_PRINT_SNAPSHOT_BYTES),
  source: DocxSourceSchema,
});

const DocxPostRequestSchemas = {
  query: DocumentQuerySchema.pick({ document: true }).strict(),
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

/** Exports use the form's saved settings, parsed the same way as the preview's URL. */
function savedPrintLayout(resLocals: ResLocalsForPage<'print-form'>) {
  const search = new URLSearchParams(printLayoutSearch(resLocals.print_form.settings));
  const query = Object.fromEntries(
    [...new Set(search.keys())].map((key) => {
      const values = search.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
  return { search, layout: parsePrintLayout(LayoutQuerySchema.parse(query)) };
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
    const coverHtml = getPrintCoverHtml(res.locals.assessment, res.locals.urlPrefix);
    const { assessmentTextHtml, honorCodeHtml } = coverHtml;
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
    const id = createPrintSnapshotId(
      {
        printFormId: res.locals.print_form.id,
        authnUserId: res.locals.authn_user.id,
        search: localPreviewUrl.searchParams,
        questionListDigest: printingResult.questionListDigest,
        coverDigest: digestPrintCoverHtml(coverHtml),
        html,
        source,
      },
      config.secretKey,
    );
    const snapshotHtml = html
      .replace('<html', () => `<html data-print-snapshot-id="${id}"`)
      .replace(
        '</head>',
        () =>
          `<script id="pl-print-docx-source" type="application/json">${JSON.stringify(source).replaceAll('<', '\\u003c')}</script></head>`,
      );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self';",
    );
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(snapshotHtml);
  }),
);

router.post(
  '/docx',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit'],
    unauthorizedUsers: 'block',
  }),
  parseDocxBody,
  typedAsyncHandler<'print-form'>(async (req, res) => {
    const {
      query: { document },
      body: snapshot,
    } = parseRequest(req, DocxPostRequestSchemas);
    const { search, layout } = savedPrintLayout(res.locals);

    const { printFormQuestionIds, questionListDigest } = await getPrintableFormQuestions(
      res.locals.print_form.id,
      layout.questionBlockSizeOverrides,
      layout.excludedQuestionNumbers,
    );
    const coverHtml = getPrintCoverHtml(res.locals.assessment, res.locals.urlPrefix);
    const { assessmentTextHtml, honorCodeHtml } = coverHtml;
    const footer = getPrintFooter({
      resLocals: res.locals,
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

    search.set('document', document);
    const localPreviewUrl = new URL(
      `${req.baseUrl}/preview?${search}`,
      `${config.serverType}://localhost:${config.serverPort}`,
    );
    const htmlDigest = checkPrintSnapshotId(
      {
        id: snapshot.id,
        source: snapshot.source,
        printFormId: res.locals.print_form.id,
        authnUserId: res.locals.authn_user.id,
        search: localPreviewUrl.searchParams,
        questionListDigest,
        coverDigest: digestPrintCoverHtml(coverHtml),
      },
      config.secretKey,
    );
    if (!htmlDigest) throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
    const root = loadPrintSnapshotRoot(snapshot.html);
    const questionCount = Number(root.attr('data-print-question-count'));
    assertPrintDocumentReady({
      questionCount,
      omittedCount: Number(root.attr('data-print-omitted-question-count')),
      // The worker checks that the questions start after the cover.
      coverPageCount: 0,
      document,
      formLabel: res.locals.print_form.label,
    });
    const gradingTable = root.attr('data-print-grading-table');
    const cover = layout.includeCoverPage
      ? makeCover(
          questionCount,
          Number(root.attr('data-print-max-points')),
          gradingTable ? PrintGradingTableSchema.parse(JSON.parse(gradingTable)) : undefined,
        )
      : undefined;
    const filename =
      assessmentFilenamePrefix(
        res.locals.assessment,
        res.locals.assessment_set,
        res.locals.course_instance,
        res.locals.course,
      ) +
      sanitizeString(
        `form_${res.locals.print_form.label}_${layout.paperSize.toLowerCase()}${
          document === 'answer_key' ? '_answer_key' : ''
        }`,
      ) +
      '.docx';
    const printExportId = await queuePrintExport({
      formSelections: [
        {
          printFormId: res.locals.print_form.id,
          excludedQuestions: [...layout.excludedQuestionNumbers],
          paperSize: layout.paperSize,
          questionListDigest,
        },
      ],
      owner: {
        assessmentId: res.locals.assessment.id,
        authnUserId: res.locals.authn_user.id,
        courseId: res.locals.course.id,
        userId: res.locals.user.id,
      },
      work: {
        format: 'docx',
        document,
        filename,
        snapshot: {
          formLabel: res.locals.print_form.label,
          printDocument: document,
          localPreviewUrl: localPreviewUrl.href,
          html: snapshot.html,
          htmlDigest,
          assetScope: printAssetScope(res.locals, printFormQuestionIds),
        },
        source: snapshot.source,
        cover,
        footer,
      },
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ printExportId });
  }),
);

// A disconnected print request, e.g. a preview reloaded after a layout change, has nobody left
// to answer, so its cancellation isn't an error worth reporting.
router.use(((err, _req, res, next) => {
  if (res.destroyed) return;
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
