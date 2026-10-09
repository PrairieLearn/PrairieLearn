import { load } from 'cheerio';
import { type RequestHandler, Router, raw } from 'express';
import mustache from 'mustache';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { markdownToHtml } from '@prairielearn/markdown';
import { parseRequestQuery } from '@prairielearn/zod';

import { renderText as renderAssessmentText } from '../../lib/assessment.js';
import {
  PrintGradingTableSchema,
  PrintIdentityFieldsSchema,
} from '../../lib/client/print-cover.js';
import { MAX_PRINT_SNAPSHOT_BYTES } from '../../lib/client/print-snapshot-limits.js';
import { config } from '../../lib/config.js';
import type { DocxSource } from '../../lib/printing/docxBrowser.js';
import { createDocxOutput } from '../../lib/printing/docxOutput.js';
import { PAPER_SIZES, type PaperSize } from '../../lib/printing/pdfOutput.js';
import {
  QUESTION_BLOCK_SIZES,
  type QuestionBlockSize,
} from '../../lib/printing/questionBlockSize.js';
import {
  PRINT_DOCUMENTS,
  type PrintDocument,
  describeOmittedQuestions,
  getPrintRenderer,
  isBrowserRenderingAvailable,
  renderAssessmentInstanceQuestionsForPrinting,
  validatePrintDocument,
  validateQuestionsForPrinting,
} from '../../lib/printing.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';

import { InstructorAssessmentInstancePrint } from './instructorAssessmentInstancePrint.html.js';
import { buildPrintableCover, getPrintFooterLabel } from './printCover.js';

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
  block_size: z.union([QuestionBlockSizeSchema, QuestionBlockSizeSchema.array()]).optional(),
  question_block_size: z
    .union([QuestionBlockSizeOverrideSchema, QuestionBlockSizeOverrideSchema.array()])
    .optional(),
  exclude_question: z
    .union([QuestionNumberSchema, QuestionNumberSchema.array()])
    .transform((numbers) => (Array.isArray(numbers) ? numbers : [numbers]))
    .default([]),
});
const DocumentQuerySchema = LayoutQuerySchema.extend({
  document: z.enum(PRINT_DOCUMENTS).default('exam'),
});
const PrintSnapshotSchema = z.strictObject({
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
/** The layout choices shared by every printable output of one assessment instance. */
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

interface PrintLocals {
  printLayout: PrintLayout;
  printDocument: PrintDocument;
}

function parsePrintLayout(query: z.infer<typeof LayoutQuerySchema>): PrintLayout {
  if (Array.isArray(query.block_size)) {
    throw new HttpStatusError(400, 'block_size may only be specified once');
  }

  const excludedQuestionNumbers = new Set(query.exclude_question);
  if (excludedQuestionNumbers.size !== query.exclude_question.length) {
    throw new HttpStatusError(400, 'exclude_question may only be specified once for each question');
  }

  const questionBlockSizeOverrides = new Map<string, QuestionBlockSize>();
  const overrides = Array.isArray(query.question_block_size)
    ? query.question_block_size
    : query.question_block_size
      ? [query.question_block_size]
      : [];
  for (const override of overrides) {
    if (questionBlockSizeOverrides.has(override.questionNumber)) {
      throw new HttpStatusError(
        400,
        `question_block_size may only be specified once for question ${override.questionNumber}`,
      );
    }
    questionBlockSizeOverrides.set(override.questionNumber, override.blockSize);
  }

  return {
    paperSize: query.paper_size,
    includeCoverPage: query.include_cover,
    includeGradingTable: query.grading_table,
    includeHonorCode: query.include_honor_code,
    formLabel: query.form_label,
    identityFields: query.identity_field,
    blockSize: query.block_size,
    questionBlockSizeOverrides,
    excludedQuestionNumbers,
  };
}

const validateDocumentQuery: RequestHandler = (req, res, next) => {
  const query = parseRequestQuery(req, DocumentQuerySchema);
  res.locals.printLayout = parsePrintLayout(query);
  res.locals.printDocument = query.document;
  next();
};

function buildPrintSearchParams(layout: PrintLayout, document: PrintDocument): URLSearchParams {
  const params = new URLSearchParams({ paper_size: layout.paperSize });
  if (!layout.includeCoverPage) params.set('include_cover', 'false');
  if (layout.includeGradingTable) params.set('grading_table', 'true');
  if (layout.includeHonorCode !== undefined) {
    params.set('include_honor_code', String(layout.includeHonorCode));
  }
  if (layout.formLabel) params.set('form_label', layout.formLabel);
  for (const identityField of layout.identityFields) params.append('identity_field', identityField);
  if (layout.blockSize) params.set('block_size', layout.blockSize);
  for (const [questionNumber, blockSize] of layout.questionBlockSizeOverrides) {
    params.append('question_block_size', `${questionNumber}:${blockSize}`);
  }
  for (const questionNumber of layout.excludedQuestionNumbers) {
    params.append('exclude_question', questionNumber);
  }
  if (document !== 'exam') params.set('document', document);
  return params;
}

function printUrl(baseUrl: string, route: string, layout: PrintLayout, document: PrintDocument) {
  return `${baseUrl}/${route}?${buildPrintSearchParams(layout, document)}`;
}

function getCoverHtml(resLocals: ResLocalsForPage<'assessment-instance'>) {
  return {
    assessmentTextHtml: renderAssessmentText(resLocals.assessment, resLocals.urlPrefix),
    honorCodeHtml: resLocals.assessment.honor_code
      ? markdownToHtml(
          mustache.render(resLocals.assessment.honor_code, {
            user_name: '____________________________',
          }),
          { allowHtml: false, interpretMath: false },
        ).replace(/^<h([1-6])>Academic integrity pledge<\/h\1>\s*/i, '')
      : null,
  };
}

const parseDocxBody: RequestHandler = (req, res, next) => {
  if (!req.is('application/octet-stream')) {
    next(new HttpStatusError(415, 'The Word export request has an unsupported format.'));
    return;
  }
  raw({ type: 'application/octet-stream', limit: 16 * 1024 * 1024 })(req, res, next);
};

const createDocxHandler = typedAsyncHandler<'assessment-instance', PrintLocals>(
  async (req, res) => {
    const { printLayout: layout, printDocument: document } = res.locals;
    await validateQuestionsForPrinting(
      res.locals.assessment_instance.id,
      layout.questionBlockSizeOverrides,
      layout.excludedQuestionNumbers,
    );
    const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);
    const footerLabel = getPrintFooterLabel({
      document,
      formId: res.locals.assessment_instance.id,
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

    if (!isBrowserRenderingAvailable()) {
      throw new HttpStatusError(
        503,
        'Printable document rendering is not configured on this server',
      );
    }
    const snapshot = PrintSnapshotSchema.parse(
      JSON.parse(z.instanceof(Buffer).parse(req.body).toString('utf8')),
    );
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
    const previewUrl = new URL(
      printUrl(req.baseUrl, 'preview', layout, document),
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
        url: previewUrl.href,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: snapshot.html,
        cookieHeader: req.get('cookie'),
        runScripts: true,
      },
      {
        ...output,
        produce: async (page) => {
          const identity = await page.evaluate(() => ({
            document: globalThis.document.documentElement.dataset.printDocument,
            formLabel: globalThis.document.documentElement.dataset.printFormLabel,
            paperSize: globalThis.document.documentElement.dataset.printPaperSize,
          }));
          if (
            identity.document !== document ||
            identity.formLabel !== (layout.formLabel ?? '') ||
            identity.paperSize !== layout.paperSize
          ) {
            throw new HttpStatusError(400, 'The printable pages do not match this document.');
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
        `instance_${res.locals.assessment_instance.id}_${layout.paperSize.toLowerCase()}${
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
  },
);

const router = Router({ mergeParams: true });

router.use(
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
);

router.get(
  '/preview',
  validateDocumentQuery,
  selectAndAuthzAssessmentInstance,
  typedAsyncHandler<'assessment-instance', PrintLocals>(async (req, res) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self';");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const { printLayout: layout, printDocument: document } = res.locals;

    const printingResult = await renderAssessmentInstanceQuestionsForPrinting(res.locals, {
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

    const rawHtml = InstructorAssessmentInstancePrint({
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
      omittedQuestionCount: describeOmittedQuestions(printingResult.questionResults).length,
      warnings: describeOmittedQuestions(printingResult.questionResults),
      extraHeadersHtml: printingResult.extraHeadersHtml,
      hasLegacyQuestions: printingResult.hasLegacyQuestions,
      maxPoints: printingResult.maxPoints,
      assessmentTextHtml,
      honorCodeHtml,
    }).toString();
    if (!isBrowserRenderingAvailable()) {
      throw new HttpStatusError(
        503,
        'Printable document rendering is not configured on this server',
      );
    }
    const previewUrl = new URL(
      req.originalUrl,
      `${config.serverType}://localhost:${config.serverPort}`,
    );
    const { html, source } = await getPrintRenderer().render(
      {
        url: previewUrl.href,
        browserOrigin: config.serverCanonicalHost ?? undefined,
        html: rawHtml,
        cookieHeader: req.get('cookie'),
        runScripts: true,
      },
      {
        label: 'preview',
        produce: async (page) =>
          await page.evaluate(() => {
            const source = Reflect.get(window, '__PL_PRINT_DOCX_SOURCE__') as
              DocxSource | undefined;
            if (!source) throw new Error('The preview did not capture editable question content.');
            const copy = globalThis.document.documentElement.cloneNode(true) as HTMLElement;
            copy
              .querySelectorAll('script, noscript, iframe, meta[http-equiv="refresh"]')
              .forEach((node) => node.remove());
            const data = globalThis.document.createElement('script');
            data.id = 'pl-print-docx-source';
            data.type = 'application/json';
            data.textContent = JSON.stringify(source).replaceAll('<', '\\u003c');
            copy.querySelector('head')?.append(data);
            return { html: `<!doctype html>\n${copy.outerHTML}`, source };
          }),
      },
    );
    PrintSnapshotSchema.shape.source.parse(source);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; script-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self';",
    );
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  }),
);

router.post(
  '/docx',
  validateDocumentQuery,
  selectAndAuthzAssessmentInstance,
  parseDocxBody,
  createDocxHandler,
);

export default router;
