import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import {
  MAX_PACKET_PAGES,
  MAX_PRINT_FORMS,
  countPrintSnapshotPages,
} from '../../lib/client/printing/print-packet.js';
import { printLayoutSearch } from '../../lib/client/printing/print-preparation.js';
import {
  MAX_PRINT_PACKET_SNAPSHOT_BYTES,
  MAX_PRINT_SNAPSHOT_BYTES,
} from '../../lib/client/printing/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/printing/print-snapshot.js';
import { getAssessmentUrl, getPrintFormUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  assertPrintDocumentReady,
  getPrintableFormQuestions,
  loadPrintSnapshotRoot,
} from '../../lib/printing/index.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import type { PrintExportWork } from '../../lib/printing/print-export-render.js';
import { printExportResult, queuePrintExport } from '../../lib/printing/print-exports.js';
import { PrintPacketMetadataSchema } from '../../lib/printing/print-packet-schema.js';
import { PrintPacketError, readPrintCoverPages } from '../../lib/printing/print-packet.js';
import { PRINT_PAPER_SIZES_MISMATCH_MESSAGE } from '../../lib/printing/print-settings.js';
import { checkPrintSnapshotId } from '../../lib/printing/print-snapshot-id.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import {
  selectOptionalPrintExport,
  selectRecentPrintExportsForAssessment,
} from '../../models/print-export.js';
import { selectPrintFormQuestionViability } from '../../models/print-form-question.js';
import { selectPrintFormsForAssessment } from '../../models/print-form.js';

import { requireCoursePermissionEdit, requireCoursePermissionPreview, t } from './init.js';
import { requirePrintingAvailable } from './print-forms.js';

export interface PrintExportsError {
  list: never;
  pdf: never;
  preflight: never;
  status: never;
}

const PreflightFormIdsSchema = z
  .array(IdSchema)
  .min(1)
  .max(MAX_PRINT_FORMS)
  .refine((ids) => new Set(ids).size === ids.length, 'Select each print form only once.');

function uploadedCoverFiles(input: FormData): File[] {
  const files = z.array(z.instanceof(File)).safeParse(input.getAll('coverPages'));
  if (!files.success) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload cover pages as PDF files.' });
  }
  return files.data;
}

function assertSharedPaperSize(forms: { settings: { paperSize: string } }[]) {
  if (
    forms.length > 1 &&
    forms.some((form) => form.settings.paperSize !== forms[0].settings.paperSize)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: PRINT_PAPER_SIZES_MISMATCH_MESSAGE,
    });
  }
}

export const printExportsRouter = t.router({
  preflight: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(z.instanceof(FormData))
    .mutation(async ({ ctx, input }) => {
      let formIds: string[];
      let document: 'assessment' | 'answer_key';
      try {
        formIds = PreflightFormIdsSchema.parse(JSON.parse(z.string().parse(input.get('formIds'))));
        document = z.enum(['assessment', 'answer_key']).parse(input.get('document'));
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid print export settings.',
          cause: error,
        });
      }
      const files = uploadedCoverFiles(input);
      if (document === 'answer_key' && files.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Answer key exports do not use uploaded cover pages.',
        });
      }
      const savedForms = await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id });
      const formsById = new Map(savedForms.map((form) => [form.id, form]));
      const forms = formIds.map((id) => {
        const form = formsById.get(id);
        if (!form || form.archived_at) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'A print form is not available.' });
        }
        return form;
      });
      assertSharedPaperSize(forms);
      const questions = await selectPrintFormQuestionViability(formIds);
      for (const form of forms) {
        const excluded = new Set(form.settings.excludedQuestions);
        const included = questions.filter(
          (question) =>
            question.print_form_id === form.id && !excluded.has(question.question_number),
        );
        const problem = included.find((question) => !question.supported || question.broken);
        if (included.length === 0 || problem) {
          return {
            coverPageCount: 0,
            failure: {
              printFormId: form.id,
              formLabel: form.label,
              message: problem
                ? `Question ${problem.question_number} in Form ${form.label} ${problem.broken ? 'has an error' : 'uses a question type that printing does not support'}. Review its preview before downloading.`
                : `Form ${form.label} has no selected questions. Include at least one question before downloading.`,
            },
          };
        }
      }
      let coverPageCount: number;
      try {
        coverPageCount = (await readPrintCoverPages(files)).reduce(
          (count, cover) => count + cover.getPageCount(),
          0,
        );
      } catch (error) {
        if (error instanceof PrintPacketError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        throw error;
      }
      return { coverPageCount, failure: null };
    }),
  pdf: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(z.instanceof(FormData))
    .mutation(async ({ ctx, input }) => {
      let metadata: z.infer<typeof PrintPacketMetadataSchema>;
      try {
        metadata = PrintPacketMetadataSchema.parse(
          JSON.parse(z.string().parse(input.get('metadata'))),
        );
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid print export settings.',
          cause: error,
        });
      }
      const savedForms = await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id });
      const formsById = new Map(savedForms.map((form) => [form.id, form]));
      const forms = metadata.forms.map((selected) => {
        const saved = formsById.get(selected.printFormId);
        if (!saved || (metadata.forms.length > 1 && saved.archived_at)) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'A print form is not available.' });
        }
        return {
          printFormId: saved.id,
          formLabel: saved.label,
          settings: saved.settings,
        };
      });
      assertSharedPaperSize(forms);
      const files = uploadedCoverFiles(input);
      if (metadata.document === 'answer_key' && files.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Answer key exports do not use uploaded cover pages.',
        });
      }
      const pages = z.array(z.instanceof(File)).safeParse(input.getAll('pages'));
      const snapshotIds = z.array(z.string().min(1)).safeParse(input.getAll('snapshotIds'));
      if (
        !pages.success ||
        pages.data.some((file) => file.size > MAX_PRINT_SNAPSHOT_BYTES) ||
        pages.data.reduce((size, file) => size + file.size, 0) > MAX_PRINT_PACKET_SNAPSHOT_BYTES
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The download contains too much content. Try fewer forms or questions.',
        });
      }
      try {
        const covers = await readPrintCoverPages(files);
        if (pages.data.length !== forms.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The preview pages are incomplete. Update the preview and try again.',
          });
        }
        if (!snapshotIds.success || snapshotIds.data.length !== forms.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
        }
        const pageHtmls = await Promise.all(pages.data.map((page) => page.text()));
        const pageCounts = pageHtmls.map(countPrintSnapshotPages);
        const coverPageCount = covers.reduce((count, cover) => count + cover.getPageCount(), 0);
        const estimatedPages = (Math.max(...pageCounts) + coverPageCount) * forms.length;
        if (estimatedPages > MAX_PACKET_PAGES) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The export would exceed 10,000 pages. Reduce the number of forms.',
          });
        }
        const formContexts = new Map<
          string,
          { questionListDigest: string; assetScope: PrintAssetScope }
        >();
        for (const form of forms) {
          const { printFormQuestionIds, questionListDigest } = await getPrintableFormQuestions(
            form.printFormId,
            new Map(
              Object.entries(form.settings.questionSizes).flatMap(([number, size]) =>
                size ? [[number, size] as const] : [],
              ),
            ),
            new Set(form.settings.excludedQuestions),
          );
          formContexts.set(form.printFormId, {
            questionListDigest,
            assetScope: {
              courseInstanceId: ctx.course_instance.id,
              assessmentId: ctx.assessment.id,
              printFormId: form.printFormId,
              printFormQuestionIds,
              authnUserId: ctx.authn_user.id,
              userId: ctx.locals.user.id,
            },
          });
        }
        const snapshots = forms.map((form, index) => {
          const printDocument = metadata.document;
          const { questionListDigest, assetScope } = formContexts.get(form.printFormId)!;
          const search = new URLSearchParams(printLayoutSearch(form.settings));
          search.set('document', printDocument);
          const localPreviewUrl = new URL(
            `${getPrintFormUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id, printFormId: form.printFormId })}/preview?${search}`,
            `${config.serverType}://localhost:${config.serverPort}`,
          );
          const htmlDigest = checkPrintSnapshotId(
            {
              id: snapshotIds.data[index],
              printFormId: form.printFormId,
              authnUserId: ctx.authn_user.id,
              search: localPreviewUrl.searchParams,
              questionListDigest,
            },
            config.secretKey,
          );
          if (!htmlDigest) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
          }
          return {
            formLabel: form.formLabel,
            printDocument,
            localPreviewUrl: localPreviewUrl.href,
            html: pageHtmls[index],
            htmlDigest,
            assetScope,
          };
        });
        // The worker checks the full signed page. Check its root here to reject exports that
        // are already known to contain omitted questions.
        for (const [index, form] of forms.entries()) {
          const root = loadPrintSnapshotRoot(pageHtmls[index]);
          assertPrintDocumentReady({
            questionCount: Number(root.attr('data-print-question-count')),
            omittedCount: Number(root.attr('data-print-omitted-question-count')),
            coverPageCount: 0,
            document: metadata.document,
            formLabel: form.formLabel,
          });
        }
        const prefix = assessmentFilenamePrefix(
          ctx.assessment,
          ctx.locals.assessment_set,
          ctx.course_instance,
          ctx.course,
        );
        const documentName =
          metadata.document === 'assessment'
            ? forms.length === 1
              ? 'assessment'
              : 'all_forms'
            : forms.length === 1
              ? 'answer_key'
              : 'all_answer_keys';
        const formName = forms.length === 1 ? `form_${forms[0].formLabel}_` : '';
        const filename = `${prefix}${formName}${documentName}.pdf`;
        const work: PrintExportWork = {
          format: 'pdf',
          document: metadata.document,
          filename,
          snapshots,
          covers: await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
            })),
          ),
        };
        const owner = {
          assessmentId: ctx.assessment.id,
          authnUserId: ctx.authn_user.id,
          courseId: ctx.course.id,
          userId: ctx.locals.user.id,
        };
        return {
          printExportId: await queuePrintExport({
            owner,
            work,
            formSelections: forms.map(({ printFormId, settings }) => ({
              printFormId,
              excludedQuestions: settings.excludedQuestions,
              paperSize: settings.paperSize,
              questionListDigest: formContexts.get(printFormId)!.questionListDigest,
            })),
          }),
        };
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 429) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: error.message, cause: error });
        }
        if (error instanceof HttpStatusError && error.status === 503) {
          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: error.message,
            cause: error,
          });
        }
        if (
          error instanceof PrintPacketError ||
          (error instanceof HttpStatusError && error.status === 400)
        ) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The PDF could not be prepared. Try again or contact support if this continues.',
          cause: error,
        });
      }
    }),
  list: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .query(async ({ ctx }) => {
      const baseUrl = getAssessmentUrl({
        courseInstanceId: ctx.course_instance.id,
        assessmentId: ctx.assessment.id,
      });
      const exports = await selectRecentPrintExportsForAssessment({
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      return exports.map((printExport) => {
        const { status, failureMessage } = printExportResult(printExport);
        return {
          id: printExport.id,
          createdAt: printExport.created_at,
          status,
          format: printExport.format,
          downloadUrl: status === 'succeeded' ? `${baseUrl}/print/exports/${printExport.id}` : null,
          sizeBytes: printExport.size_bytes,
          label: printExport.label,
          failureMessage,
        };
      });
    }),
  status: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .input(z.object({ printExportId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const printExport = await selectOptionalPrintExport({
        printExportId: input.printExportId,
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      if (!printExport) throw new TRPCError({ code: 'NOT_FOUND' });
      const { status, failureMessage } = printExportResult(printExport);
      return {
        status,
        format: printExport.format,
        downloadUrl:
          status === 'succeeded'
            ? `${getAssessmentUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id })}/print/exports/${printExport.id}`
            : null,
        sizeBytes: printExport.size_bytes,
        label: printExport.label,
        failureMessage,
      };
    }),
});
