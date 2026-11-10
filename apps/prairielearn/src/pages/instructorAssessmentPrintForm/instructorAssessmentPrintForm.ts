import { load } from 'cheerio';
import { type RequestHandler, Router, raw } from 'express';
import mustache from 'mustache';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { markdownToHtml } from '@prairielearn/markdown';
import { ValueType, getCounter, getHistogram, metrics } from '@prairielearn/opentelemetry';
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
} from '../../lib/client/print-cover.js';
import { serializePrintDocument } from '../../lib/client/print-document.js';
import { MAX_PRINT_SNAPSHOT_BYTES } from '../../lib/client/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/print-snapshot.js';
import { config } from '../../lib/config.js';
import type { DocxSource } from '../../lib/printing/docx-browser.js';
import { createDocxOutput } from '../../lib/printing/docx-output.js';
import {
  PRINT_DOCUMENTS,
  describeOmittedQuestions,
  getPrintRenderer,
  getPrintableFormQuestionIds,
  getPrintableQuestionListDigest,
  isBrowserRenderingAvailable,
  renderPrintFormQuestions,
  validatePrintDocument,
  validateQuestionsForPrinting,
} from '../../lib/printing/index.js';
import { PAPER_SIZES, type PaperSize } from '../../lib/printing/paper-size.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import { createPrintFormQuestionAssetRouter } from '../../lib/printing/print-asset-routes.js';
import {
  BLANK_NAME_PLACEHOLDER,
  HONOR_CODE_HEADING,
  buildPrintableCover,
  getPrintFooterLabel,
} from '../../lib/printing/print-cover.js';
import { withPrintRequest } from '../../lib/printing/print-request.js';
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
  form_label: z
    .string()
    .regex(/^[A-Z]$/)
    .optional(),
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
  source: z.strictObject({
    html: z.string().max(MAX_PRINT_SNAPSHOT_BYTES),
    figures: z.array(
      z.strictObject({
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
  formLabel: string | undefined;
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
    formLabel: query.form_label,
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
      userId: res.locals.user.id,
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
    await withPrintRequest(res, async ({ signal, remainingTimeoutMs, throwIfAborted }) => {
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

      const meter = metrics.getMeter('prairielearn');
      const attributes = { document };
      const startedAt = performance.now();
      res.once('finish', () => {
        getHistogram(meter, 'print.preview.request.duration', {
          unit: 'milliseconds',
          valueType: ValueType.DOUBLE,
        }).record(performance.now() - startedAt, attributes);
        getHistogram(meter, 'print.preview.rss', {
          unit: 'bytes',
          valueType: ValueType.INT,
        }).record(process.memoryUsage().rss, attributes);
        if (res.statusCode >= 400) {
          getCounter(meter, 'print.preview.failures', { valueType: ValueType.INT }).add(
            1,
            attributes,
          );
        }
      });

      const printingResult = await renderPrintFormQuestions(res.locals, {
        signal,
        defaultQuestionBlockSize: layout.blockSize ?? 'auto',
        questionBlockSizeOverrides: layout.questionBlockSizeOverrides,
        excludedQuestionNumbers: layout.excludedQuestionNumbers,
        document,
      });
      throwIfAborted();
      getHistogram(meter, 'print.preview.questions.duration', {
        unit: 'milliseconds',
        valueType: ValueType.DOUBLE,
      }).record(performance.now() - startedAt, attributes);
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
        formLabel: layout.formLabel,
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
      throwIfAborted();
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
          signal,
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
      throwIfAborted();
      const id = createPrintSnapshotId(
        {
          printFormId: res.locals.print_form.id,
          authnUserId: res.locals.authn_user.id,
          search: localPreviewUrl.searchParams,
          questionListDigest: printingResult.questionListDigest,
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
      throwIfAborted();
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' data: blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self';",
      );
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.send(snapshotHtml);
    });
  }),
);

router.post(
  '/docx',
  parseDocxBody,
  typedAsyncHandler<'print-form'>(async (req, res) => {
    await withPrintRequest(res, async ({ signal, remainingTimeoutMs, throwIfAborted }) => {
      const { query, body: snapshot } = parseRequest(req, DocxPostRequestSchemas);
      const layout = parsePrintLayout(query);
      const { document } = query;

      if (!isBrowserRenderingAvailable()) {
        throw new HttpStatusError(
          404,
          'Printable document rendering is not configured on this server',
        );
      }

      await validateQuestionsForPrinting(
        res.locals.print_form.id,
        layout.questionBlockSizeOverrides,
        layout.excludedQuestionNumbers,
      );
      throwIfAborted();
      const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);
      const footerLabel = getPrintFooterLabel({
        document,
        formId: res.locals.print_form.id,
        formLabel: layout.formLabel,
      });
      const makeCover = (
        questionCount: number,
        maxPoints: number,
        gradingTable?: z.infer<typeof PrintGradingTableSchema>,
      ) =>
        buildPrintableCover({
          resLocals: res.locals,
          document,
          formLabel: layout.formLabel,
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
        req.originalUrl,
        `${config.serverType}://localhost:${config.serverPort}`,
      );
      localPreviewUrl.pathname = `${req.baseUrl}/preview`;
      const questionListDigest = await getPrintableQuestionListDigest(
        res.locals.print_form.id,
        layout.excludedQuestionNumbers,
      );
      throwIfAborted();
      if (
        !checkPrintSnapshotId(
          {
            ...snapshot,
            printFormId: res.locals.print_form.id,
            authnUserId: res.locals.authn_user.id,
            search: localPreviewUrl.searchParams,
            questionListDigest,
          },
          config.secretKey,
        )
      ) {
        throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
      }
      const $ = load(snapshot.html);
      const hasExecutableAttributes =
        $('*').filter((_index, node) =>
          'attribs' in node
            ? Object.entries(node.attribs).some(
                ([name, value]) =>
                  /^on/i.test(name) || name === 'srcdoc' || /^\s*javascript:/i.test(String(value)),
              )
            : false,
        ).length > 0;
      if (
        $('script, iframe, object, embed, base, meta[http-equiv="refresh"]').length > 0 ||
        hasExecutableAttributes
      ) {
        throw new HttpStatusError(400, 'The printable pages contain executable content.');
      }
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
      const printFormQuestionIds = await getPrintableFormQuestionIds(
        res.locals.print_form.id,
        layout.excludedQuestionNumbers,
      );
      throwIfAborted();
      const contents = await getPrintRenderer().render(
        {
          url: localPreviewUrl.href,
          browserOrigin: config.serverCanonicalHost ?? undefined,
          html: snapshot.html,
          assetScope: printAssetScope(res.locals, printFormQuestionIds),
          signal,
          timeoutMs: remainingTimeoutMs(),
        },
        {
          ...output,
          produce: async (page) => {
            const identity = await page.evaluate(() => ({
              formId: globalThis.document.documentElement.dataset.printFormId,
              document: globalThis.document.documentElement.dataset.printDocument,
              formLabel: globalThis.document.documentElement.dataset.printFormLabel,
            }));
            throwIfAborted();
            if (
              identity.formId !== res.locals.print_form.id ||
              identity.document !== document ||
              identity.formLabel !== (layout.formLabel ?? '')
            ) {
              throw new HttpStatusError(
                400,
                'The preview does not match the requested form, document type, or form label. Generate a new preview before exporting.',
              );
            }
            await validatePrintDocument(page);
            throwIfAborted();
            return await output.produce(page);
          },
        },
      );
      throwIfAborted();

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
    });
  }),
);

export default router;
