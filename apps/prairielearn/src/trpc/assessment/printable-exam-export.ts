import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { encodePrintPageIdentity } from '../../lib/client/print-page-code.js';
import { printLayoutSearch } from '../../lib/client/print-preparation.js';
import {
  MAX_PRINT_PACKET_SNAPSHOT_BYTES,
  MAX_PRINT_SNAPSHOT_BYTES,
} from '../../lib/client/print-snapshot-limits.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import {
  PrintPacketError,
  assemblePrintPacket,
  readPrintCoverPages,
} from '../../lib/print-packet.js';
import { createPdfOutput } from '../../lib/printing/pdfOutput.js';
import {
  type PrintDocument,
  getPrintRenderer,
  isBrowserRenderingAvailable,
  validatePrintDocument,
  validateQuestionsForPrinting,
} from '../../lib/printing.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';

import { requireCoursePermissionPreview, t } from './init.js';

export interface PrintableExamExportError {
  pdf: never;
}

export const printableExamExportRouter = t.router({
  pdf: t.procedure
    .use(requireCoursePermissionPreview)
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
      const instances = await selectAssessmentInstancesForUser({
        assessment_id: ctx.assessment.id,
        user_id: ctx.locals.user.id,
      });
      if (
        metadata.instances.some(
          (selected) =>
            !instances.some((instance) => instance.id === selected.assessmentInstanceId),
        )
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'An assessment instance is not available.',
        });
      }
      const files = z.array(z.instanceof(File)).safeParse(input.getAll('coverPages'));
      if (!files.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload cover pages as PDF files.' });
      }
      const pages = z.array(z.instanceof(File)).safeParse(input.getAll('pages'));
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
        if (!isBrowserRenderingAvailable()) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'PDF rendering is not configured on this server.',
          });
        }
        const renderer = getPrintRenderer();
        const generatedAt = new Date().toISOString();
        const exportId = randomUUID();
        const forms: { pdf: Buffer; coverPageCount: number }[] = [];
        const answerKeys: Buffer[] = [];
        const plan = run(() => {
          switch (metadata.document) {
            case 'exam':
              return {
                filename: 'assessment',
                documents: ['exam'] as PrintDocument[],
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
                documents: ['exam', 'answer_key'] as PrintDocument[],
                appendAnswerKeys: true,
              };
            default:
              return assertNever(metadata.document);
          }
        });
        const selectedInstances = plan.appendAnswerKeys
          ? metadata.instances
          : metadata.instances.slice(0, metadata.copies);
        const expectedPageFiles = selectedInstances.reduce(
          (count, _instance, index) =>
            count +
            plan.documents.filter((document) => document !== 'exam' || index < metadata.copies)
              .length,
          0,
        );
        if (pages.data.length !== expectedPageFiles) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The printable pages are incomplete.',
          });
        }
        let pageFileIndex = 0;
        for (const [index, instance] of selectedInstances.entries()) {
          const overrides = new Map(
            Object.entries(instance.settings.questionSizes).flatMap(([number, size]) =>
              size ? [[number, size] as const] : [],
            ),
          );
          await validateQuestionsForPrinting(
            instance.assessmentInstanceId,
            overrides,
            new Set(instance.settings.excludedQuestions),
          );
          for (const printDocument of plan.documents) {
            // Every selected form gets a key, even if there are fewer copies than forms.
            if (printDocument === 'exam' && index >= metadata.copies) continue;
            const search = new URLSearchParams(printLayoutSearch(instance.settings));
            search.set('document', printDocument);
            search.set('form_label', instance.formLabel);
            const previewUrl = new URL(
              `${getAssessmentInstanceUrl({ courseInstanceId: ctx.course_instance.id, assessmentInstanceId: instance.assessmentInstanceId })}/paper/preview?${search}`,
              `${config.serverType}://localhost:${config.serverPort}`,
            );
            const html = await pages.data[pageFileIndex++].text();
            const pdfOutput = createPdfOutput({
              encodePage: (pageNumber) =>
                encodePrintPageIdentity({
                  courseId: ctx.course.id,
                  assessmentId: ctx.assessment.id,
                  assessmentInstanceId: instance.assessmentInstanceId,
                  pageNumber,
                  generatedBy: {
                    userId: ctx.authn_user.id,
                    uid: ctx.authn_user.uid,
                    name: ctx.authn_user.name,
                  },
                  generatedAt,
                  exportId,
                  document: printDocument,
                  format: 'pdf',
                }),
            });
            const rendered = await renderer.render(
              {
                url: previewUrl.href,
                browserOrigin: config.serverCanonicalHost ?? undefined,
                html,
                cookieHeader: ctx.cookieHeader,
              },
              {
                label: plan.appendAnswerKeys ? 'booklet PDF' : 'PDF',
                produce: async (page) => {
                  const identity = await page.evaluate(() => ({
                    document: document.documentElement.dataset.printDocument,
                    formLabel: document.documentElement.dataset.printFormLabel,
                    paperSize: document.documentElement.dataset.printPaperSize,
                  }));
                  if (
                    identity.document !== printDocument ||
                    identity.formLabel !== instance.formLabel ||
                    identity.paperSize !== instance.settings.paperSize
                  ) {
                    throw new TRPCError({
                      code: 'BAD_REQUEST',
                      message: 'The printable pages do not match the selected form.',
                    });
                  }
                  const state = await validatePrintDocument(page);
                  return {
                    pdf: await pdfOutput.produce(page),
                    coverPageCount: state.coverPageCount,
                  };
                },
              },
            );
            if (plan.appendAnswerKeys && printDocument === 'answer_key') {
              answerKeys.push(rendered.pdf);
            } else {
              forms.push(rendered);
            }
          }
        }
        const packet = await assemblePrintPacket({
          forms,
          covers,
          copies: metadata.copies,
          answerKeys,
        });
        const prefix = assessmentFilenamePrefix(
          ctx.assessment,
          ctx.locals.assessment_set,
          ctx.course_instance,
          ctx.course,
        );
        return {
          base64: packet.toString('base64'),
          filename: `${prefix}${plan.filename}_${metadata.copies}_copies.pdf`,
        };
      } catch (error) {
        if (
          error instanceof PrintPacketError ||
          (error instanceof HttpStatusError && error.status === 400)
        ) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        throw error;
      }
    }),
});
