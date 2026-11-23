import { type ErrorRequestHandler, Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams, parseRequestQuery } from '@prairielearn/zod';

import {
  PrintGradingTableSchema,
  printIdentityFields,
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
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import { createPrintFormQuestionAssetRouter } from '../../lib/printing/print-asset-routes.js';
import {
  buildPrintableCover,
  getPrintCoverHtml,
  getPrintFooter,
} from '../../lib/printing/print-cover.js';
import { serializePrintDocument } from '../../lib/printing/print-document.js';
import { startPrintRequest } from '../../lib/printing/print-request.js';
import { printQuestionSizeOverrides } from '../../lib/printing/print-settings.js';
import { storePrintSnapshot } from '../../lib/printing/print-snapshots.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import authzHasCoursePreview from '../../middlewares/authzHasCoursePreview.js';
import { requirePrintingAvailable } from '../../middlewares/requirePrintingAvailable.js';
import { selectOptionalPrintForm } from '../../models/print-form.js';

import { InstructorAssessmentPrintForm } from './instructorAssessmentPrintForm.html.js';

const PrintFormParamsSchema = z.object({ print_form_id: IdSchema });

const PreviewQuerySchema = z.strictObject({
  document: z.enum(PRINT_DOCUMENTS).default('assessment'),
});

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
    const { document } = parseRequestQuery(req, PreviewQuerySchema);
    const { settings } = res.locals.print_form;
    const identityFields = settings.includeCoverPage
      ? printIdentityFields(settings.identityFields)
      : [];

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
      defaultQuestionBlockSize: settings.blockSize,
      questionBlockSizeOverrides: printQuestionSizeOverrides(settings),
      excludedQuestionNumbers: new Set(settings.excludedQuestions),
      document,
    });
    const { assessmentTextHtml, honorCodeHtml } = getPrintCoverHtml(
      res.locals.assessment,
      res.locals.urlPrefix,
    );
    const warnings = describeOmittedQuestions(printingResult.questionResults);

    const rawHtml = InstructorAssessmentPrintForm({
      resLocals: res.locals,
      paperSize: settings.paperSize,
      includeCoverPage: settings.includeCoverPage,
      includeGradingTable: settings.includeGradingTable,
      includeHonorCode: settings.includeHonorCode,
      document,
      formLabel: res.locals.print_form.label,
      identityFields,
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
          questionListDigest: printingResult.questionListDigest,
        },
        {
          html,
          docx: {
            source,
            cover: settings.includeCoverPage
              ? buildPrintableCover({
                  resLocals: res.locals,
                  document,
                  formLabel,
                  identityFields,
                  questionCount: summary.questionCount,
                  maxPoints: printingResult.maxPoints,
                  assessmentTextHtml,
                  honorCodeHtml,
                  includeHonorCode: settings.includeHonorCode,
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
