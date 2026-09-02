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
  renderUrlToPdf,
} from '@prairielearn/printing';
import { parseRequestQuery } from '@prairielearn/zod';

import { renderText as renderAssessmentText } from '../../lib/assessment.js';
import { config } from '../../lib/config.js';
import {
  PRINT_DOCUMENTS,
  type PrintDocument,
  renderAssessmentInstanceQuestionsForPrinting,
  validateQuestionBlockSizeOverridesForPrinting,
} from '../../lib/printing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';

import { InstructorAssessmentInstancePrint } from './instructorAssessmentInstancePrint.html.js';

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

const QuerySchema = z.strictObject({
  paper_size: z.enum(PAPER_SIZES),
  document: z.enum(PRINT_DOCUMENTS).default('exam'),
  identity_field: IdentityFieldsSchema,
  block_size: z.union([QuestionBlockSizeSchema, QuestionBlockSizeSchema.array()]).optional(),
  question_block_size: z
    .union([QuestionBlockSizeOverrideSchema, QuestionBlockSizeOverrideSchema.array()])
    .optional(),
});

const validateQuery: RequestHandler = (req, res, next) => {
  const query = parseRequestQuery(req, QuerySchema);
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

  res.locals.paperSize = query.paper_size;
  res.locals.printDocument = query.document;
  res.locals.identityFields = query.identity_field;
  res.locals.defaultQuestionBlockSize = query.block_size ?? 'auto';
  res.locals.questionBlockSizeOverrides = questionBlockSizeOverrides;
  next();
};

const router = Router({ mergeParams: true });

router.get(
  '/',
  validateQuery,
  selectAndAuthzAssessmentInstance,
  typedAsyncHandler<
    'assessment-instance',
    {
      paperSize: PaperSize;
      printDocument: PrintDocument;
      identityFields: string[];
      defaultQuestionBlockSize: QuestionBlockSize;
      questionBlockSizeOverrides: ReadonlyMap<string, QuestionBlockSize>;
    }
  >(async (req, res) => {
    if (res.locals.assessment.type !== 'Exam') {
      throw new HttpStatusError(400, 'Only exam assessment instances can be printed');
    }

    const responseType = req.accepts(['text/html', 'application/pdf']);
    if (!responseType) throw new HttpStatusError(406, 'Not Acceptable');
    res.vary('Accept');
    res.setHeader('Cache-Control', 'private, no-store');

    if (responseType === 'application/pdf') {
      if (!config.devMode && config.printingPlaywrightWsEndpoint === null) {
        throw new HttpStatusError(503, 'PDF printing is not configured on this server');
      }

      await validateQuestionBlockSizeOverridesForPrinting(
        res.locals.assessment_instance.id,
        res.locals.questionBlockSizeOverrides,
      );

      const internalUrl = new URL(
        req.originalUrl,
        `${config.serverType}://localhost:${config.serverPort}`,
      );
      let pdf: Buffer;
      try {
        pdf = await renderUrlToPdf({
          url: internalUrl.href,
          cookieHeader: req.get('cookie'),
          browserWSEndpoint: config.printingPlaywrightWsEndpoint ?? undefined,
        });
      } catch (error) {
        if (error instanceof QuestionBlockSizeOverflowError) {
          throw new HttpStatusError(422, error.message, { cause: error });
        }
        throw error;
      }
      const filename =
        assessmentFilenamePrefix(
          res.locals.assessment,
          res.locals.assessment_set,
          res.locals.course_instance,
          res.locals.course,
        ) +
        sanitizeString(
          `instance_${res.locals.assessment_instance.id}_${res.locals.paperSize.toLowerCase()}${
            res.locals.printDocument === 'answer_key' ? '_answer_key' : ''
          }`,
        ) +
        '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdf);
      return;
    }

    const printingResult = await renderAssessmentInstanceQuestionsForPrinting(res.locals, {
      defaultQuestionBlockSize: res.locals.defaultQuestionBlockSize,
      questionBlockSizeOverrides: res.locals.questionBlockSizeOverrides,
      document: res.locals.printDocument,
    });
    const assessmentTextHtml = renderAssessmentText(res.locals.assessment, res.locals.urlPrefix);
    const honorCodeHtml =
      res.locals.assessment.require_honor_code && res.locals.assessment.honor_code
        ? markdownToHtml(
            mustache.render(res.locals.assessment.honor_code, {
              user_name: '____________________________',
            }),
            { allowHtml: false, interpretMath: false },
          )
        : null;

    res.send(
      InstructorAssessmentInstancePrint({
        resLocals: res.locals,
        paperSize: res.locals.paperSize,
        document: res.locals.printDocument,
        identityFields: res.locals.identityFields,
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

export default router;
