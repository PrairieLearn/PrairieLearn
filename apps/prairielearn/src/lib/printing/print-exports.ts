import { createHash, randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { ValueType, getCounter, getHistogram, metrics } from '@prairielearn/opentelemetry';
import { Queue, Worker } from '@prairielearn/prairiemq';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import {
  claimPrintExport,
  finishPrintExport,
  insertPrintExport,
} from '../../models/print-export.js';
import { deleteFromS3, getFromS3, uploadToS3 } from '../aws.js';
import { config } from '../config.js';
import type { PrintExport } from '../db-types.js';
import { getFileStoreS3Bucket } from '../file-store.js';

import {
  type PrintExportWork,
  PrintExportWorkSchema,
  renderPrintExport,
} from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';

import { isBrowserRenderingAvailable } from './index.js';

const KEY_PREFIX = 'print-exports/';
const QUEUE_NAME = 'print-exports';
// Courses take turns starting exports and each runs at most two at once, so total
// throughput scales with the number of workers. PrairieMQ persists this value in Redis
// and stops workers that disagree, so changing it also requires a new queue prefix.
const COURSE_CONCURRENCY = 2;
// A run interrupted by a graceful shutdown counts as an attempt, so allow for a rolling
// deploy interrupting it more than once. Crashed runs are recovered separately as stalls.
const MAX_ATTEMPTS = 3;
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
      defaultJobOptions: { attempts: MAX_ATTEMPTS, removeOnComplete: true, removeOnFail: true },
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
    async (job) => await processPrintExport(IdSchema.parse(job.data.printExportId)),
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
  const { document, copies, snapshots } = work;
  if (document === 'booklet') {
    return `Booklet PDF for ${copies} ${copies === 1 ? 'student' : 'students'}`;
  }
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
}: {
  owner: { assessmentId: string; authnUserId: string; courseId: string; userId: string };
  work: PrintExportWork;
}): Promise<string> {
  const currentQueue = getQueue();
  if (shutdownController.signal.aborted || !currentQueue) {
    throw new HttpStatusError(503, UNAVAILABLE_MESSAGE);
  }
  const bucket = getFileStoreS3Bucket();
  const inputKey = `${KEY_PREFIX}input/${randomUUID()}.json`;
  await uploadToS3(bucket, inputKey, null, false, Buffer.from(JSON.stringify(work)));
  let printExportId: string;
  try {
    printExportId = await insertPrintExport({
      assessmentId: owner.assessmentId,
      userId: owner.userId,
      authnUserId: owner.authnUserId,
      format: work.format,
      filename: work.filename,
      label: getPrintExportLabel(work),
      inputKey,
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

async function processPrintExport(printExportId: string) {
  const signal = shutdownController.signal;
  signal.throwIfAborted();
  const printExport = await claimPrintExport(printExportId);
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
 * Downloads expire 24 hours after the export was queued. An export that is still pending
 * by then, e.g. because Redis lost its job, reads as failed.
 */
export function printExportResult(printExport: PrintExport & { expired: boolean }) {
  if (printExport.expired && printExport.status === 'succeeded') {
    return { status: 'expired' as const, failureMessage: null };
  }
  if (printExport.expired && printExport.status === 'pending') {
    return {
      status: 'failed' as const,
      failureMessage: 'The export did not finish within 24 hours. Try again.',
    };
  }
  return { status: printExport.status, failureMessage: printExport.failure_message };
}

export async function getPrintExportStream(key: string) {
  return await getFromS3(getFileStoreS3Bucket(), key, false);
}
