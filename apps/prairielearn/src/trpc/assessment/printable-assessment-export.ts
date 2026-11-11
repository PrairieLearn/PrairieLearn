import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { ValueType, getHistogram, metrics } from '@prairielearn/opentelemetry';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { MAX_PACKET_PAGES } from '../../lib/client/print-packet.js';
import { printLayoutSearch } from '../../lib/client/print-preparation.js';
import {
  MAX_PRINT_PACKET_SNAPSHOT_BYTES,
  MAX_PRINT_SNAPSHOT_BYTES,
} from '../../lib/client/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/print-snapshot.js';
import { getAssessmentUrl, getPrintFormUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import type { PrintExportWork } from '../../lib/print-export-render.js';
import { queuePrintExport, selectPrintExport } from '../../lib/print-exports.js';
import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import { PrintPacketError, readPrintCoverPages } from '../../lib/print-packet.js';
import {
  type PrintDocument,
  getPrintableFormQuestionIds,
  getPrintableQuestionListDigest,
  validateQuestionsForPrinting,
} from '../../lib/printing/index.js';
import { checkPrintSnapshotId } from '../../lib/printing/print-snapshot-id.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { selectPrintFormsForUser } from '../../models/print-form.js';

import { requireCoursePermissionPreview, t } from './init.js';
import { requirePrintableAssessments } from './print-forms.js';

/** @knipignore Consumed by the preparation UI in the following PR. */
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
      const forms = await selectPrintFormsForUser({
        assessmentId: ctx.assessment.id,
        userId: ctx.locals.user.id,
      });
      if (
        metadata.forms.some((selected) => !forms.some((form) => form.id === selected.printFormId))
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'A print form is not available.',
        });
      }
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
        const plan = run(() => {
          switch (metadata.document) {
            case 'assessment':
              return {
                filename: 'assessment',
                documents: ['assessment'] as PrintDocument[],
                appendAnswerKeys: false,
              };
            case 'answer_key':
              return {
                filename: 'answer_keys',
                documents: ['answer_key'] as PrintDocument[],
                appendAnswerKeys: false,
              };
            case 'booklet':
              return {
                filename: 'booklet',
                documents: ['assessment', 'answer_key'] as PrintDocument[],
                appendAnswerKeys: true,
              };
            default:
              return assertNever(metadata.document);
          }
        });
        const selectedForms = plan.appendAnswerKeys
          ? metadata.forms
          : metadata.forms.slice(0, metadata.copies);
        const expectedPageFiles = selectedForms.reduce(
          (count, _form, index) =>
            count +
            plan.documents.filter(
              (document) => document !== 'assessment' || index < metadata.copies,
            ).length,
          0,
        );
        if (pages.data.length !== expectedPageFiles) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The printable pages are incomplete.',
          });
        }
        if (!snapshotIds.success || snapshotIds.data.length !== expectedPageFiles) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
        }
        const pageHtmls = await Promise.all(pages.data.map((page) => page.text()));
        const pageCounts = pageHtmls.map((html) =>
          Math.max(1, [...html.matchAll(/class="[^"]*\bpagedjs_page\b[^"]*"/g)].length),
        );
        const formPageCounts: number[] = [];
        const answerKeyPageCounts: number[] = [];
        let pageCountIndex = 0;
        for (const index of selectedForms.keys()) {
          for (const printDocument of plan.documents) {
            if (printDocument === 'assessment' && index >= metadata.copies) continue;
            const count = pageCounts[pageCountIndex++];
            if (plan.appendAnswerKeys && printDocument === 'answer_key') {
              answerKeyPageCounts.push(count);
            } else {
              formPageCounts.push(count);
            }
          }
        }
        const coverPageCount = covers.reduce((count, cover) => count + cover.getPageCount(), 0);
        const estimatedPages =
          Array.from({ length: metadata.copies }, (_, index) =>
            formPageCounts.length > 0
              ? formPageCounts[index % formPageCounts.length] + coverPageCount
              : 0,
          ).reduce((sum, count) => sum + count, 0) +
          answerKeyPageCounts.reduce((sum, count) => sum + count, 0);
        if (estimatedPages > MAX_PACKET_PAGES) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The export would exceed 10,000 pages. Reduce the number of copies.',
          });
        }
        const snapshots: Extract<PrintExportWork, { format: 'pdf' }>['snapshots'] = [];
        let pageFileIndex = 0;
        for (const [index, form] of selectedForms.entries()) {
          const excludedQuestions = new Set(form.settings.excludedQuestions);
          await validateQuestionsForPrinting(
            form.printFormId,
            new Map(
              Object.entries(form.settings.questionSizes).flatMap(([number, size]) =>
                size ? [[number, size] as const] : [],
              ),
            ),
            excludedQuestions,
          );
          const questionListDigest = await getPrintableQuestionListDigest(
            form.printFormId,
            excludedQuestions,
          );
          const assetScope = {
            courseInstanceId: ctx.course_instance.id,
            assessmentId: ctx.assessment.id,
            printFormId: form.printFormId,
            printFormQuestionIds: await getPrintableFormQuestionIds(
              form.printFormId,
              excludedQuestions,
            ),
            authnUserId: ctx.authn_user.id,
            userId: ctx.locals.user.id,
          };
          for (const printDocument of plan.documents) {
            if (printDocument === 'assessment' && index >= metadata.copies) continue;
            const search = new URLSearchParams(printLayoutSearch(form.settings));
            search.set('document', printDocument);
            search.set('form_label', form.formLabel);
            const localPreviewUrl = new URL(
              `${getPrintFormUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id, printFormId: form.printFormId })}/preview?${search}`,
              `${config.serverType}://localhost:${config.serverPort}`,
            );
            const html = pageHtmls[pageFileIndex];
            const id = snapshotIds.data[pageFileIndex++];
            if (
              !checkPrintSnapshotId(
                {
                  id,
                  printFormId: form.printFormId,
                  authnUserId: ctx.authn_user.id,
                  search: localPreviewUrl.searchParams,
                  questionListDigest,
                  html,
                },
                config.secretKey,
              )
            ) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
            }
            snapshots.push({
              formLabel: form.formLabel,
              paperSize: form.settings.paperSize,
              printDocument,
              localPreviewUrl: localPreviewUrl.href,
              html,
              assetScope,
            });
          }
        }
        const prefix = assessmentFilenamePrefix(
          ctx.assessment,
          ctx.locals.assessment_set,
          ctx.course_instance,
          ctx.course,
        );
        const filename = `${prefix}${plan.filename}_${metadata.copies}_copies.pdf`;
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
        const inputBytes =
          pages.data.reduce((sum, page) => sum + page.size, 0) +
          files.data.reduce((sum, file) => sum + file.size, 0);
        const meter = metrics.getMeter('prairielearn');
        const attributes = { document: metadata.document };
        getHistogram(meter, 'print.export.pages', { valueType: ValueType.INT }).record(
          estimatedPages,
          attributes,
        );
        getHistogram(meter, 'print.export.input_bytes', {
          unit: 'bytes',
          valueType: ValueType.INT,
        }).record(inputBytes, attributes);
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
      const printExport = await selectPrintExport({
        printExportId: input.printExportId,
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      if (!printExport) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        status: printExport.status,
        format: printExport.format,
        downloadUrl:
          printExport.status === 'succeeded'
            ? `${getAssessmentUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id })}/print_preparation/exports/${printExport.id}`
            : null,
        sizeBytes: printExport.size_bytes,
        label: printExport.label,
        failureMessage: printExport.failure_message,
      };
    }),
});
