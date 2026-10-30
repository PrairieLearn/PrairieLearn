import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  ValueType,
  getCounter,
  getHistogram,
  instrumentedWithMetrics,
  metrics,
} from '@prairielearn/opentelemetry';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import {
  MAX_INLINE_PRINT_PACKET_BYTES,
  MAX_INLINE_PRINT_PACKET_INPUT_BYTES,
  MAX_INLINE_PRINT_PACKET_PAGES,
  MAX_PACKET_PAGES,
} from '../../lib/client/print-packet.js';
import { printLayoutSearch } from '../../lib/client/print-preparation.js';
import {
  MAX_PRINT_PACKET_SNAPSHOT_BYTES,
  MAX_PRINT_SNAPSHOT_BYTES,
} from '../../lib/client/print-snapshot-limits.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/print-snapshot.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  queuePrintExport,
  selectPrintExportJob,
  storeCompletedPrintExport,
} from '../../lib/print-export-jobs.js';
import { type PrintExportWork, renderPrintExport } from '../../lib/print-export-render.js';
import { PrintPacketMetadataSchema } from '../../lib/print-packet-schema.js';
import { PrintPacketError, readPrintCoverPages } from '../../lib/print-packet.js';
import {
  type PrintDocument,
  getPrintRenderer,
  getPrintableInstanceQuestionIds,
  getPrintableQuestionListDigest,
  isBrowserRenderingAvailable,
  validateQuestionsForPrinting,
} from '../../lib/printing/index.js';
import { checkPrintSnapshotId } from '../../lib/printing/print-snapshot-id.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';

import { requireCoursePermissionPreview, t } from './init.js';
import { requirePrintableAssessments } from './printable-assessments.js';

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
        const selectedInstances = plan.appendAnswerKeys
          ? metadata.instances
          : metadata.instances.slice(0, metadata.copies);
        const expectedPageFiles = selectedInstances.reduce(
          (count, _instance, index) =>
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
        for (const index of selectedInstances.keys()) {
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
        const snapshots: PrintExportWork['snapshots'] = [];
        let pageFileIndex = 0;
        for (const [index, instance] of selectedInstances.entries()) {
          const excludedQuestions = new Set(instance.settings.excludedQuestions);
          await validateQuestionsForPrinting(
            instance.assessmentInstanceId,
            new Map(
              Object.entries(instance.settings.questionSizes).flatMap(([number, size]) =>
                size ? [[number, size] as const] : [],
              ),
            ),
            excludedQuestions,
          );
          const questionListDigest = await getPrintableQuestionListDigest(
            instance.assessmentInstanceId,
            excludedQuestions,
          );
          const assetScope = {
            courseInstanceId: ctx.course_instance.id,
            assessmentId: ctx.assessment.id,
            assessmentInstanceId: instance.assessmentInstanceId,
            instanceQuestionIds: await getPrintableInstanceQuestionIds(
              instance.assessmentInstanceId,
              excludedQuestions,
            ),
            authnUserId: ctx.authn_user.id,
            userId: ctx.locals.user.id,
          };
          for (const printDocument of plan.documents) {
            if (printDocument === 'assessment' && index >= metadata.copies) continue;
            const search = new URLSearchParams(printLayoutSearch(instance.settings));
            search.set('document', printDocument);
            search.set('form_label', instance.formLabel);
            const localPreviewUrl = new URL(
              `${getAssessmentInstanceUrl({ courseInstanceId: ctx.course_instance.id, assessmentInstanceId: instance.assessmentInstanceId })}/print/preview?${search}`,
              `${config.serverType}://localhost:${config.serverPort}`,
            );
            const html = pageHtmls[pageFileIndex];
            const id = snapshotIds.data[pageFileIndex++];
            if (
              !checkPrintSnapshotId(
                {
                  id,
                  assessmentInstanceId: instance.assessmentInstanceId,
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
              formLabel: instance.formLabel,
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
        if (!isBrowserRenderingAvailable()) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'PDF rendering is not configured on this server.',
          });
        }
        const meter = metrics.getMeter('prairielearn');
        const attributes = { document: metadata.document };
        const pathCounter = getCounter(meter, 'print.export.path', { valueType: ValueType.INT });
        getHistogram(meter, 'print.export.pages', { valueType: ValueType.INT }).record(
          estimatedPages,
          attributes,
        );
        getHistogram(meter, 'print.export.input_bytes', {
          unit: 'bytes',
          valueType: ValueType.INT,
        }).record(inputBytes, attributes);
        const renderPacketUnmeasured = async () => await renderPrintExport(work, covers);
        const renderPacket = async () =>
          await instrumentedWithMetrics(
            meter,
            'print.export.packet',
            renderPacketUnmeasured,
            () => {
              getHistogram(meter, 'print.export.rss', {
                unit: 'bytes',
                valueType: ValueType.INT,
              }).record(process.memoryUsage().rss, attributes);
            },
          );
        const owner = {
          assessmentId: ctx.assessment.id,
          authnUserId: ctx.authn_user.id,
          courseId: ctx.course.id,
          courseInstanceId: ctx.course_instance.id,
          userId: ctx.locals.user.id,
        };
        const queue = async () => ({
          type: 'background' as const,
          jobSequenceId: await queuePrintExport({ owner, work }),
        });
        const backgroundReason =
          estimatedPages >= MAX_INLINE_PRINT_PACKET_PAGES
            ? 'page_count'
            : inputBytes >= MAX_INLINE_PRINT_PACKET_INPUT_BYTES
              ? 'input_bytes'
              : null;
        if (backgroundReason) {
          pathCounter.add(1, { ...attributes, path: 'background', reason: backgroundReason });
          return await queue();
        }
        // Admission is best effort; the render queue still bounds requests that race this check.
        if (!getPrintRenderer().getLoad().canStartImmediately) {
          pathCounter.add(1, { ...attributes, path: 'background', reason: 'capacity' });
          return await queue();
        }
        const packet = await renderPacket();
        getHistogram(meter, 'print.export.output_bytes', {
          unit: 'bytes',
          valueType: ValueType.INT,
        }).record(packet.length, attributes);
        if (packet.length > MAX_INLINE_PRINT_PACKET_BYTES) {
          pathCounter.add(1, { ...attributes, path: 'background', reason: 'output_size' });
          return {
            type: 'background' as const,
            jobSequenceId: await storeCompletedPrintExport({
              owner,
              packet,
              work,
            }),
          };
        }
        pathCounter.add(1, { ...attributes, path: 'inline', reason: 'small' });
        return { type: 'inline' as const, base64: packet.toString('base64'), filename };
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
    .input(z.object({ jobSequenceId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const job = await selectPrintExportJob({
        jobSequenceId: input.jobSequenceId,
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        status: job.status,
        ready: !!job.result,
        sizeBytes: job.result?.sizeBytes ?? null,
        exportLabel: job.result?.exportLabel ?? null,
        failureMessage: job.failureMessage,
        canViewJobLogs: ctx.authz_data.has_course_instance_permission_view,
      };
    }),
});
