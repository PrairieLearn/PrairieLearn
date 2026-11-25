import { createHash, randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { ValueType, getCounter, getHistogram, metrics } from '@prairielearn/opentelemetry';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { Queue, Worker } from '@prairielearn/prairiemq';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import {
  finishPrintExport,
  insertPrintExport,
  selectOptionalPendingPrintExport,
  selectUnfinishedPrintExportCount,
} from '../../models/print-export.js';
import {
  lockAssessmentForPrintForms,
  lockPrintFormQuestionSelections,
  selectPrintFormsForAssessment,
} from '../../models/print-form.js';
import { deleteFromS3, getFromS3, uploadToS3 } from '../aws.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../client/printing/print-snapshot.js';
import { config } from '../config.js';
import type { PrintExport } from '../db-types.js';
import { getFileStoreS3Bucket } from '../file-store.js';

import type { PaperSize } from './paper-size.js';
import {
  type PrintExportWork,
  PrintExportWorkSchema,
  renderPrintExport,
} from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';
import { PRINT_PAPER_SIZES_MISMATCH_MESSAGE, sameExcludedQuestions } from './print-settings.js';
import { RenderQueueFullError } from './render-queue.js';

import { getPrintableQuestionListDigest, isBrowserRenderingAvailable } from './index.js';

const KEY_PREFIX = 'print-exports/';
const QUEUE_NAME = 'print-exports';
// Courses take turns starting exports and each runs at most two at once, so total
// throughput scales with the number of workers. PrairieMQ persists this value in Redis
// and stops workers that disagree, so changing it also requires a new queue prefix.
const COURSE_CONCURRENCY = 2;
// Runs interrupted by a graceful shutdown or refused by a busy renderer count as attempts,
// so allow for more than one. Crashed runs are recovered separately as stalls.
const MAX_ATTEMPTS = 3;
// Spreads retries over a few seconds so a brief database or S3 outage doesn't use them all.
const RETRY_BACKOFF = { type: 'exponential', delay: 2_000, jitter: 0.2 } as const;
// Bounds the queue and stored input one user can create by replaying export requests.
const MAX_UNFINISHED_EXPORTS_PER_USER = 5;
const TOO_MANY_MESSAGE =
  'You have too many downloads in progress. Wait for one to finish and try again.';
const UNAVAILABLE_MESSAGE =
  'Downloads are unavailable right now. Try again later or contact support.';
const EXHAUSTED_MESSAGE =
  'The file could not be prepared after repeated attempts. Try again or contact support.';
let queue: Queue<{ printExportId: string }, void> | null = null;
let worker: Worker<{ printExportId: string }, void> | null = null;
let workerClosing: Promise<void> | null = null;
let shutdownController = new AbortController();

function reportQueueError(error: unknown) {
  logger.error('Print export queue error', error);
  Sentry.captureException(error);
}

function queueConnection(redisUrl: string) {
  return {
    redisUrl,
    redisMode: config.printExportRedisMode,
    persistentMetadata: config.printExportPersistentMetadata,
    prefix:
      config.printExportQueuePrefix ??
      `prairielearn-print-exports-${createHash('sha256')
        .update(JSON.stringify([config.postgresqlHost, config.postgresqlDatabase]))
        .digest('hex')}`,
  };
}

/** Connects lazily so hosts that never queue exports don't need Redis. */
function getQueue() {
  if (!queue && config.nonVolatileRedisUrl) {
    queue = new Queue(QUEUE_NAME, {
      ...queueConnection(config.nonVolatileRedisUrl),
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: RETRY_BACKOFF,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    queue.on('error', reportQueueError);
  }
  return queue;
}

/** Starts this host's export worker. Connection errors are reported instead of failing startup. */
export function initPrintExportWorker() {
  if (
    worker ||
    !config.nonVolatileRedisUrl ||
    !config.printExportWorkerActive ||
    !isBrowserRenderingAvailable()
  ) {
    return;
  }
  worker = new Worker<{ printExportId: string }, void>(
    QUEUE_NAME,
    async (job) =>
      await processPrintExport(IdSchema.parse(job.data.printExportId), {
        finalAttempt: job.failedAttempts + 1 >= job.attempts,
      }),
    {
      ...queueConnection(config.nonVolatileRedisUrl),
      concurrency: 2,
      groupConcurrency: COURSE_CONCURRENCY,
      maxStalledCount: 2,
      lockDuration: 300_000,
    },
  );
  worker.on('error', reportQueueError);
  // Runs that finish normally record their own result, so these only see exports that
  // ran out of attempts or stalled too often.
  worker.on('failed', (job, error) => {
    reportQueueError(error);
    void failExhaustedPrintExport(job.data.printExportId);
  });
  worker.on('stalled', (jobId, failed) => {
    if (failed) void failExhaustedPrintExport(jobId.replace(/^print-export-/, ''));
  });
}

async function failExhaustedPrintExport(printExportId: string) {
  await finishPrintExport(printExportId, {
    status: 'failed',
    failureMessage: EXHAUSTED_MESSAGE,
  }).catch(reportQueueError);
}

export function beginPrintExportShutdown() {
  shutdownController.abort();
  workerClosing ??= worker?.close().catch(reportQueueError) ?? Promise.resolve();
}

export async function waitForPrintExportWorkers() {
  try {
    await (workerClosing ?? worker?.close());
  } finally {
    await queue?.close();
    queue = null;
    worker = null;
    workerClosing = null;
    // Vite can restart the server without restarting this process.
    shutdownController = new AbortController();
  }
}

function getPrintExportLabel(work: PrintExportWork): string {
  if (work.format === 'docx') {
    const form = `Form ${work.snapshot.formLabel}`;
    return work.document === 'answer_key'
      ? `${form} answer key Word document`
      : `${form} Word document`;
  }
  const { document, snapshots } = work;
  const formLabels = new Set(snapshots.map((snapshot) => snapshot.formLabel));
  if (formLabels.size === 1) {
    const form = `Form ${[...formLabels][0]}`;
    return document === 'answer_key' ? `${form} answer key PDF` : `${form} PDF`;
  }
  return document === 'answer_key'
    ? `PDF with ${formLabels.size} form answer keys`
    : `PDF with ${formLabels.size} forms`;
}

function printableFailureMessage(error: unknown, format: PrintExportWork['format']): string | null {
  if (error instanceof HttpStatusError && error.status === 504) {
    return format === 'docx'
      ? 'The Word document took too long to prepare. Try again.'
      : 'The PDF took too long to prepare. Try again.';
  }
  if (
    error instanceof PrintPacketError ||
    (error instanceof HttpStatusError && [400, 503].includes(error.status)) ||
    (error instanceof TRPCError && error.code === 'BAD_REQUEST')
  ) {
    return error.message;
  }
  return null;
}

export async function queuePrintExport({
  owner,
  work,
  formSelections,
}: {
  owner: { assessmentId: string; authnUserId: string; courseId: string; userId: string };
  work: PrintExportWork;
  formSelections: {
    printFormId: string;
    excludedQuestions: string[];
    paperSize: PaperSize;
    questionListDigest: string;
  }[];
}): Promise<string> {
  const currentQueue = getQueue();
  if (shutdownController.signal.aborted || !currentQueue) {
    throw new HttpStatusError(503, UNAVAILABLE_MESSAGE);
  }
  if ((await selectUnfinishedPrintExportCount(owner)) >= MAX_UNFINISHED_EXPORTS_PER_USER) {
    throw new HttpStatusError(429, TOO_MANY_MESSAGE);
  }
  const bucket = getFileStoreS3Bucket();
  const inputKey = `${KEY_PREFIX}input/${randomUUID()}.json`;
  await uploadToS3(bucket, inputKey, null, false, Buffer.from(JSON.stringify(work)));
  let printExportId: string;
  try {
    printExportId = await runInTransactionAsync(async () => {
      await lockAssessmentForPrintForms(owner.assessmentId);
      const savedForms = new Map(
        (await selectPrintFormsForAssessment({ assessmentId: owner.assessmentId })).map((form) => [
          form.id,
          form,
        ]),
      );
      const paperSizes = new Set<PaperSize>();
      for (const {
        printFormId,
        excludedQuestions,
        paperSize,
        questionListDigest,
      } of formSelections) {
        const saved = savedForms.get(printFormId);
        if (
          !saved ||
          (formSelections.length > 1 && saved.archived_at !== null) ||
          saved.settings.paperSize !== paperSize ||
          !sameExcludedQuestions(saved.settings.excludedQuestions, excludedQuestions)
        ) {
          throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
        }
        if (
          (await getPrintableQuestionListDigest(printFormId, new Set(excludedQuestions))) !==
          questionListDigest
        ) {
          throw new HttpStatusError(400, STALE_PRINT_SNAPSHOT_MESSAGE);
        }
        paperSizes.add(paperSize);
      }
      if (paperSizes.size > 1) {
        throw new HttpStatusError(400, PRINT_PAPER_SIZES_MISMATCH_MESSAGE);
      }
      await lockPrintFormQuestionSelections({
        assessmentId: owner.assessmentId,
        printFormIds: formSelections.map(({ printFormId }) => printFormId),
      });
      return await insertPrintExport({
        assessmentId: owner.assessmentId,
        userId: owner.userId,
        authnUserId: owner.authnUserId,
        format: work.format,
        filename: work.filename,
        label: getPrintExportLabel(work),
        inputKey,
      });
    });
  } catch (error) {
    await deleteFromS3(bucket, inputKey);
    throw error;
  }
  try {
    await currentQueue.add(
      'render',
      { printExportId },
      { jobId: `print-export-${printExportId}`, group: { id: owner.courseId } },
    );
  } catch (error) {
    reportQueueError(error);
    await finishPrintExport(printExportId, {
      status: 'failed',
      failureMessage: UNAVAILABLE_MESSAGE,
    });
    throw new HttpStatusError(503, UNAVAILABLE_MESSAGE);
  }
  return printExportId;
}

async function processPrintExport(
  printExportId: string,
  { finalAttempt }: { finalAttempt: boolean },
) {
  const signal = shutdownController.signal;
  signal.throwIfAborted();
  const printExport = await selectOptionalPendingPrintExport(printExportId);
  if (!printExport) return;
  const { format } = printExport;
  const bucket = getFileStoreS3Bucket();
  const meter = metrics.getMeter('prairielearn');
  const attributes = { format };
  getHistogram(meter, 'print.export.queue_wait', {
    unit: 'milliseconds',
    valueType: ValueType.DOUBLE,
  }).record(Date.now() - printExport.created_at.getTime(), attributes);
  const startedAt = performance.now();
  try {
    const work = PrintExportWorkSchema.parse(
      JSON.parse((await getFromS3(bucket, printExport.input_key, true)).toString('utf8')),
    );
    const packet = await renderPrintExport(work, signal);
    signal.throwIfAborted();
    const outputKey = `${KEY_PREFIX}${randomUUID()}.${format}`;
    await uploadToS3(bucket, outputKey, null, false, packet);
    const finished = await finishPrintExport(printExport.id, {
      status: 'succeeded',
      outputKey,
      sizeBytes: packet.length,
    });
    if (!finished) await deleteFromS3(bucket, outputKey);
  } catch (error) {
    // PrairieMQ retries a run interrupted by shutdown on another worker.
    if (signal.aborted) throw error;
    // Let PrairieMQ retry after a backoff, since a busy renderer refuses work before starting it.
    if (!finalAttempt && error instanceof RenderQueueFullError) {
      throw error;
    }
    getCounter(meter, 'print.export.failures', { valueType: ValueType.INT }).add(1, attributes);
    const failureMessage = printableFailureMessage(error, format);
    if (failureMessage === null) {
      Sentry.captureException(error, { tags: { 'print_export.id': printExport.id } });
    }
    await finishPrintExport(printExport.id, {
      status: 'failed',
      failureMessage:
        failureMessage ??
        `The ${format === 'docx' ? 'Word document' : 'PDF'} could not be prepared. Try again or contact support if this continues.`,
    });
  } finally {
    getHistogram(meter, 'print.export.duration', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    }).record(performance.now() - startedAt, attributes);
  }
}

/**
 * Downloads expire 24 hours after the export was queued. An export still pending after
 * 30 minutes, e.g. because Redis lost its job, reads as failed: retries and stall
 * recovery finish well within that.
 */
export function printExportResult(
  printExport: Pick<PrintExport, 'status' | 'failure_message'> & {
    expired: boolean;
    overdue: boolean;
  },
) {
  if (printExport.expired && printExport.status === 'succeeded') {
    return { status: 'expired' as const, failureMessage: null };
  }
  if (printExport.overdue && printExport.status === 'pending') {
    return {
      status: 'failed' as const,
      failureMessage: 'The export took too long to finish. Try again.',
    };
  }
  return { status: printExport.status, failureMessage: printExport.failure_message };
}

export async function getPrintExportStream(key: string) {
  return await getFromS3(getFileStoreS3Bucket(), key, false);
}
