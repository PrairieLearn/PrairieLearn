import { type RequestHandler, Router } from 'express';
import mustache from 'mustache';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { markdownToHtml } from '@prairielearn/markdown';
import {
  PAPER_SIZES,
  type PaperSize,
  QUESTION_BLOCK_SIZES,
  type QuestionBlockSize,
  QuestionBlockSizeOverflowError,
} from '@prairielearn/printing';
import { parseRequestQuery } from '@prairielearn/zod';

import { renderText as renderAssessmentText } from '../../lib/assessment.js';
import { config } from '../../lib/config.js';
import type { Assessment } from '../../lib/db-types.js';
import {
  type OmittedQuestionWarning,
  PRINT_DOCUMENTS,
  type PrintDocument,
  describeOmittedQuestions,
  getPrintRenderer,
  isBrowserRenderingAvailable,
  renderAssessmentInstanceQuestionsForPrinting,
  validateQuestionBlockSizeOverridesForPrinting,
} from '../../lib/printing.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';

import { InstructorAssessmentInstancePrint } from './instructorAssessmentInstancePrint.html.js';
import { buildPrintableCover, getPrintFooterLabel } from './printCover.js';

const PRINT_FORMATS = {
  pdf: {
    contentType: 'application/pdf',
    disposition: 'inline',
    extension: 'pdf',
  },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    disposition: 'attachment',
    extension: 'docx',
  },
} as const;
type PrintFormat = keyof typeof PRINT_FORMATS;

const QuestionBlockSizeSchema = z.enum(QUESTION_BLOCK_SIZES);
const IdentityFieldSchema = z.string().trim().min(1).max(40);
const IdentityFieldsSchema = z
  .union([IdentityFieldSchema, IdentityFieldSchema.array()])
  .transform((fields) => (Array.isArray(fields) ? fields : [fields]))
  .pipe(IdentityFieldSchema.array().max(6))
  .default([]);
const QuestionBlockSizeOverrideSchema = z
  .string()
  .regex(new RegExp(`^[1-9]\\d*:(${QUESTION_BLOCK_SIZES.join('|')})$`))
  .transform((value) => {
    const [questionNumber, blockSize] = value.split(':');
    return {
      questionNumber,
      blockSize: QuestionBlockSizeSchema.parse(blockSize),
    };
  });

const LayoutQuerySchema = z.strictObject({
  paper_size: z.enum(PAPER_SIZES),
  identity_field: IdentityFieldsSchema,
  block_size: z.union([QuestionBlockSizeSchema, QuestionBlockSizeSchema.array()]).optional(),
  question_block_size: z
    .union([QuestionBlockSizeOverrideSchema, QuestionBlockSizeOverrideSchema.array()])
    .optional(),
});
const DocumentQuerySchema = LayoutQuerySchema.extend({
  document: z.enum(PRINT_DOCUMENTS).default('exam'),
});

/** The layout choices shared by every printable output of one assessment instance. */
interface PrintLayout {
  paperSize: PaperSize;
  identityFields: string[];
  blockSize: QuestionBlockSize | undefined;
  questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>;
}

interface PrintLocals {
  printLayout: PrintLayout;
  printDocument: PrintDocument;
}

type PrintWarning = OmittedQuestionWarning | { code: 'rendering_unavailable'; message: string };

/** The JSON returned by `GET /paper`. */
interface PrintableAssessmentInstanceResponse {
  pdf_url: string;
  answer_key_pdf_url: string;
  docx_url: string;
  warnings: PrintWarning[];
}

function parsePrintLayout(query: z.infer<typeof LayoutQuerySchema>): PrintLayout {
  if (Array.isArray(query.block_size)) {
    throw new HttpStatusError(400, 'block_size may only be specified once');
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
    identityFields: query.identity_field,
    blockSize: query.block_size,
    questionBlockSizeOverrides,
  };
}

const validateLayoutQuery: RequestHandler = (req, res, next) => {
  res.locals.printLayout = parsePrintLayout(parseRequestQuery(req, LayoutQuerySchema));
  next();
};

const validateDocumentQuery: RequestHandler = (req, res, next) => {
  const query = parseRequestQuery(req, DocumentQuerySchema);
  res.locals.printLayout = parsePrintLayout(query);
  res.locals.printDocument = query.document;
  next();
};

function assertPrintableAssessment(assessment: Assessment): void {
  if (assessment.type !== 'Exam') {
    throw new HttpStatusError(400, 'Only exam assessment instances can be printed');
  }
}

function buildPrintSearchParams(layout: PrintLayout, document: PrintDocument): URLSearchParams {
  const params = new URLSearchParams({ paper_size: layout.paperSize });
  for (const identityField of layout.identityFields) params.append('identity_field', identityField);
  if (layout.blockSize) params.set('block_size', layout.blockSize);
  for (const [questionNumber, blockSize] of layout.questionBlockSizeOverrides) {
    params.append('question_block_size', `${questionNumber}:${blockSize}`);
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
    honorCodeHtml:
      resLocals.assessment.require_honor_code && resLocals.assessment.honor_code
        ? markdownToHtml(
            mustache.render(resLocals.assessment.honor_code, {
              user_name: '____________________________',
            }),
            { allowHtml: false, interpretMath: false },
          ).replace(/^<h([1-6])>Academic integrity pledge<\/h\1>\s*/i, '')
        : null,
  };
}

function createDocumentHandler(format: PrintFormat) {
  return typedAsyncHandler<'assessment-instance', PrintLocals>(async (req, res) => {
    assertPrintableAssessment(res.locals.assessment);
    if (!isBrowserRenderingAvailable()) {
      throw new HttpStatusError(
        503,
        'Printable document rendering is not configured on this server',
      );
    }
    const { printLayout: layout, printDocument: document } = res.locals;
    await validateQuestionBlockSizeOverridesForPrinting(
      res.locals.assessment_instance.id,
      layout.questionBlockSizeOverrides,
    );

    // The renderer loads the HTML preview of this same document through the application.
    const previewUrl = new URL(
      printUrl(req.baseUrl, 'preview', layout, document),
      `${config.serverType}://localhost:${config.serverPort}`,
    );
    const renderOptions = { url: previewUrl.href, cookieHeader: req.get('cookie') };
    const renderer = getPrintRenderer();
    let output: Buffer;
    try {
      if (format === 'pdf') {
        output = await renderer.renderPdf(renderOptions);
      } else {
        const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);
        output = await renderer.renderDocx({
          ...renderOptions,
          // The question count and points are only known once the page has rendered and
          // omitted any broken questions, so the cover reads them back from the page.
          cover: (pageDataset) =>
            buildPrintableCover({
              resLocals: res.locals,
              document,
              paperSize: layout.paperSize,
              identityFields: layout.identityFields,
              questionCount: Number(pageDataset.printQuestionCount),
              maxPoints: Number(pageDataset.printMaxPoints),
              assessmentTextHtml,
              honorCodeHtml,
            }),
          footerLabel: getPrintFooterLabel({
            document,
            formId: res.locals.assessment_instance.id,
          }),
        });
      }
    } catch (error) {
      if (error instanceof QuestionBlockSizeOverflowError) {
        throw new HttpStatusError(422, error.message, { cause: error });
      }
      throw error;
    }

    const { contentType, disposition, extension } = PRINT_FORMATS[format];
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
      `.${extension}`;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.send(output);
  });
}

const router = Router({ mergeParams: true });

router.get(
  '/',
  validateLayoutQuery,
  selectAndAuthzAssessmentInstance,
  typedAsyncHandler<'assessment-instance', Pick<PrintLocals, 'printLayout'>>(async (req, res) => {
    assertPrintableAssessment(res.locals.assessment);
    const layout = res.locals.printLayout;

    // Rendering the student form here reuses or creates the instance's variants, so the
    // documents linked below are built from the same questions this report describes.
    const printingResult = await renderAssessmentInstanceQuestionsForPrinting(res.locals, {
      defaultQuestionBlockSize: layout.blockSize ?? 'auto',
      questionBlockSizeOverrides: layout.questionBlockSizeOverrides,
      document: 'exam',
    });
    const warnings: PrintWarning[] = describeOmittedQuestions(printingResult.questionResults);
    if (!isBrowserRenderingAvailable()) {
      warnings.push({
        code: 'rendering_unavailable',
        message: 'PDF and Word rendering is not configured on this server.',
      });
    }

    const response: PrintableAssessmentInstanceResponse = {
      pdf_url: printUrl(req.baseUrl, 'pdf', layout, 'exam'),
      answer_key_pdf_url: printUrl(req.baseUrl, 'pdf', layout, 'answer_key'),
      docx_url: printUrl(req.baseUrl, 'docx', layout, 'exam'),
      warnings,
    };
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(response);
  }),
);

router.get(
  '/preview',
  validateDocumentQuery,
  selectAndAuthzAssessmentInstance,
  typedAsyncHandler<'assessment-instance', PrintLocals>(async (req, res) => {
    assertPrintableAssessment(res.locals.assessment);
    const { printLayout: layout, printDocument: document } = res.locals;

    const printingResult = await renderAssessmentInstanceQuestionsForPrinting(res.locals, {
      defaultQuestionBlockSize: layout.blockSize ?? 'auto',
      questionBlockSizeOverrides: layout.questionBlockSizeOverrides,
      document,
    });
    const { assessmentTextHtml, honorCodeHtml } = getCoverHtml(res.locals);

    res.setHeader('Cache-Control', 'private, no-store');
    res.send(
      InstructorAssessmentInstancePrint({
        resLocals: res.locals,
        paperSize: layout.paperSize,
        document,
        identityFields: layout.identityFields,
        questionHtmls: printingResult.questionHtmls,
        extraHeadersHtml: printingResult.extraHeadersHtml,
        hasLegacyQuestions: printingResult.hasLegacyQuestions,
        maxPoints: printingResult.maxPoints,
        assessmentTextHtml,
        honorCodeHtml,
      }).toString(),
    );
  }),
);

router.get(
  '/pdf',
  validateDocumentQuery,
  selectAndAuthzAssessmentInstance,
  createDocumentHandler('pdf'),
);
router.get(
  '/docx',
  validateDocumentQuery,
  selectAndAuthzAssessmentInstance,
  createDocumentHandler('docx'),
);

export default router;
