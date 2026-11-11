import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { MAX_PACKET_PAGES } from '../../lib/client/printing/print-packet.js';
import { printLayoutSearch } from '../../lib/client/printing/print-preparation.js';
import {
  MAX_PRINT_PACKET_SNAPSHOT_BYTES,
  MAX_PRINT_SNAPSHOT_BYTES,
} from '../../lib/client/printing/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/printing/print-snapshot.js';
import { getAssessmentUrl, getPrintFormUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  type PrintDocument,
  getPrintableFormQuestionIds,
  getPrintableQuestionListDigest,
} from '../../lib/printing/index.js';
import type { PrintAssetScope } from '../../lib/printing/print-asset-access.js';
import type { PrintExportWork } from '../../lib/printing/print-export-render.js';
import { queuePrintExport } from '../../lib/printing/print-exports.js';
import { PrintPacketMetadataSchema } from '../../lib/printing/print-packet-schema.js';
import { PrintPacketError, readPrintCoverPages } from '../../lib/printing/print-packet.js';
import { checkPrintSnapshotId } from '../../lib/printing/print-snapshot-id.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { selectOptionalPrintExport } from '../../models/print-export.js';
import { selectPrintFormsForAssessment } from '../../models/print-form.js';

import { requireCoursePermissionPreview, t } from './init.js';
import { requirePrintableAssessments } from './print-forms.js';

export interface PrintableAssessmentExportError {
  pdf: never;
  status: never;
}

export const printableAssessmentExportRouter = t.router({
  pdf: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintableAssessments)
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
          message:
            (error instanceof z.ZodError
              ? error.issues.find((issue) => issue.path.includes('identityFields'))?.message
              : undefined) ?? 'Invalid print export settings.',
          cause: error,
        });
      }
      const savedForms = await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id });
      const formsById = new Map(savedForms.map((form) => [form.id, form]));
      const forms = metadata.forms.map((selected) => {
        const saved = formsById.get(selected.printFormId);
        if (!saved) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'A print form is not available.' });
        }
        return { ...selected, formLabel: saved.label };
      });
      const files = z.array(z.instanceof(File)).safeParse(input.getAll('coverPages'));
      if (!files.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload cover pages as PDF files.' });
      }
      if (metadata.document === 'answer_key' && files.data.length > 0) {
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The printable pages are too large.' });
      }
      try {
        const covers =
          metadata.document === 'answer_key' ? [] : await readPrintCoverPages(files.data);
        // Copies cycle through the first `copies` forms; booklets also append every form's answer key.
        const entries = forms.flatMap((form, index) => {
          const printed = index < metadata.copies;
          const documents: PrintDocument[] = {
            assessment: printed ? ['assessment' as const] : [],
            answer_key: printed ? ['answer_key' as const] : [],
            booklet: printed
              ? ['assessment' as const, 'answer_key' as const]
              : ['answer_key' as const],
          }[metadata.document];
          return documents.map((printDocument) => ({ form, printDocument }));
        });
        if (pages.data.length !== entries.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The printable pages are incomplete.',
          });
        }
        if (!snapshotIds.success || snapshotIds.data.length !== entries.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
        }
        const pageHtmls = await Promise.all(pages.data.map((page) => page.text()));
        const pageCounts = pageHtmls.map((html) =>
          Math.max(1, [...html.matchAll(/class="[^"]*\bpagedjs_page\b[^"]*"/g)].length),
        );
        const isAppendedAnswerKey = (index: number) =>
          metadata.document === 'booklet' && entries[index].printDocument === 'answer_key';
        const formPageCounts = pageCounts.filter((_, index) => !isAppendedAnswerKey(index));
        const coverPageCount = covers.reduce((count, cover) => count + cover.getPageCount(), 0);
        const estimatedPages =
          Array.from(
            { length: metadata.copies },
            (_, copy) => formPageCounts[copy % formPageCounts.length] + coverPageCount,
          ).reduce((sum, count) => sum + count, 0) +
          pageCounts
            .filter((_, index) => isAppendedAnswerKey(index))
            .reduce((sum, count) => sum + count, 0);
        if (estimatedPages > MAX_PACKET_PAGES) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The export would exceed 10,000 pages. Reduce the number of copies.',
          });
        }
        const formContexts = new Map<
          string,
          { questionListDigest: string; assetScope: PrintAssetScope }
        >();
        for (const form of forms) {
          const excludedQuestions = new Set(form.settings.excludedQuestions);
          const printFormQuestionIds = await getPrintableFormQuestionIds(
            form.printFormId,
            new Map(
              Object.entries(form.settings.questionSizes).flatMap(([number, size]) =>
                size ? [[number, size] as const] : [],
              ),
            ),
            excludedQuestions,
          );
          formContexts.set(form.printFormId, {
            questionListDigest: await getPrintableQuestionListDigest(
              form.printFormId,
              excludedQuestions,
            ),
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
        const snapshots = entries.map(({ form, printDocument }, index) => {
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
        const prefix = assessmentFilenamePrefix(
          ctx.assessment,
          ctx.locals.assessment_set,
          ctx.course_instance,
          ctx.course,
        );
        const documentName = {
          assessment: 'assessment',
          answer_key: 'answer_keys',
          booklet: 'booklet',
        }[metadata.document];
        const filename = `${prefix}${documentName}_${metadata.copies}_copies.pdf`;
        const work: PrintExportWork = {
          format: 'pdf',
          document: metadata.document,
          copies: metadata.copies,
          filename,
          snapshots,
          covers: await Promise.all(
            files.data.map(async (file) => ({
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
        return { printExportId: await queuePrintExport({ owner, work }) };
      } catch (error) {
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
          message: 'The PDF could not be prepared because of a server error.',
          cause: error,
        });
      }
    }),
  status: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintableAssessments)
    .input(z.object({ printExportId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const printExport = await selectOptionalPrintExport({
        printExportId: input.printExportId,
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      if (!printExport) throw new TRPCError({ code: 'NOT_FOUND' });
      const status =
        printExport.status === 'succeeded' && printExport.expired ? 'expired' : printExport.status;
      return {
        status,
        format: printExport.format,
        downloadUrl:
          status === 'succeeded'
            ? `${getAssessmentUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id })}/print_preparation/exports/${printExport.id}`
            : null,
        sizeBytes: printExport.size_bytes,
        label: printExport.label,
        failureMessage: printExport.failure_message,
      };
    }),
});
