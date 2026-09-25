import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { QuestionBlockSizeOverflowError, createPdfOutput } from '@prairielearn/printing';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { encodePrintPageIdentity } from '../../lib/client/print-page-code.js';
import { type PrintDocument, printLayoutSearch } from '../../lib/client/print-preparation.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import {
  PrintPacketError,
  assemblePrintPacket,
  readPrintCoverPages,
} from '../../lib/print-packet.js';
import {
  getPrintRenderer,
  isBrowserRenderingAvailable,
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
      if (ctx.assessment.type !== 'Exam') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only exams can be printed.' });
      }
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
      try {
        const covers = await readPrintCoverPages(files.data);
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
                filename: 'exam',
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
            // Every selected form gets a key, even if there are fewer exam copies than forms.
            if (printDocument === 'exam' && index >= metadata.copies) continue;
            const search = new URLSearchParams(printLayoutSearch(instance.settings));
            search.set('document', printDocument);
            search.set('form_label', instance.formLabel);
            const previewUrl = new URL(
              `${getAssessmentInstanceUrl({ courseInstanceId: ctx.course_instance.id, assessmentInstanceId: instance.assessmentInstanceId })}/paper/preview?${search}`,
              `${config.serverType}://localhost:${config.serverPort}`,
            );
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
              { url: previewUrl.href, cookieHeader: ctx.cookieHeader },
              {
                label: plan.appendAnswerKeys ? 'booklet PDF' : 'PDF',
                produce: async (page) => {
                  const state = await page.evaluate(() => {
                    const sheets = [...document.querySelectorAll('.pagedjs_page')];
                    return {
                      questionCount: Number(document.documentElement.dataset.printQuestionCount),
                      omittedCount: Number(
                        document.documentElement.dataset.printOmittedQuestionCount,
                      ),
                      coverPageCount: sheets.findIndex((sheet) =>
                        sheet.querySelector('.printing-question'),
                      ),
                    };
                  });
                  if (!state.questionCount || state.omittedCount || state.coverPageCount < 1) {
                    throw new TRPCError({
                      code: 'BAD_REQUEST',
                      message: `${printDocument === 'answer_key' ? 'The answer key for Form' : 'Form'} ${instance.formLabel} has missing or unprintable questions. Review its preview and exclude or fix those questions before exporting.`,
                    });
                  }
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
          error instanceof QuestionBlockSizeOverflowError ||
          (error instanceof HttpStatusError && error.status === 400)
        ) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        throw error;
      }
    }),
});
