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
  failStalePrintExports,
  finishPrintExport,
  insertPrintExport,
  releasePrintExport,
  selectPendingPrintExports,
} from '../models/print-export.js';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';
import { getFileStoreS3Bucket } from './file-store.js';
import {
  type PrintExportWork,
  PrintExportWorkSchema,
  renderPrintExport,
} from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';
import { isBrowserRenderingAvailable } from './printing/index.js';

const KEY_PREFIX = 'print-exports/';
const QUEUE_NAME = 'print-exports';
// Courses take turns starting exports and each runs at most two at once, so total
// throughput scales with the number of workers. PrairieMQ persists this value in Redis
// and stops workers that disagree, so changing it also requires a new queue prefix.
const COURSE_CONCURRENCY = 2;
// Graceful shutdowns release their attempt, so only runs that crash or stall count.
const MAX_ATTEMPTS = 2;
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

/** Connects lazily so hosts that never queue or reconcile exports don't need Redis. */
function getQueue() {
  if (!queue && config.nonVolatileRedisUrl) {
    queue = new Queue(QUEUE_NAME, {
      ...queueConnection(config.nonVolatileRedisUrl),
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
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
  worker.on('failed', (_job, error) => reportQueueError(error));
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

async function publishPrintExport({
  printExportId,
  courseId,
}: {
  printExportId: string;
  courseId: string;
}) {
  const currentQueue = getQueue();
  if (currentQueue && !shutdownController.signal.aborted) {
    await currentQueue.add(
      'render',
      { printExportId },
      { jobId: `print-export-${printExportId}`, group: { id: courseId } },
    );
  }
}

function getPrintExportLabel(work: PrintExportWork): string {
  if (work.format === 'docx') {
    const form = work.snapshot.formLabel
      ? `Form ${work.snapshot.formLabel}`
      : `Form ID ${work.snapshot.assetScope.printFormId}`;
    return work.document === 'answer_key'
      ? `${form} answer key Word document`
      : `${form} Word document`;
  }
  const { document, copies, snapshots } = work;
  if (document === 'booklet') {
    return `booklet PDF for ${copies} ${copies === 1 ? 'student' : 'students'}`;
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
  if (
    error instanceof Error &&
    /^Timed out after \d+ ms (waiting to render|rendering) the /.test(error.message)
  ) {
    return format === 'docx'
      ? 'Rendering took too long. Try again.'
      : 'Rendering took too long. Try again, or export fewer forms at once.';
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
  if (shutdownController.signal.aborted || !getQueue()) {
    throw new HttpStatusError(503, 'Print export queuing is not available on this server.');
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
      inputKey,
    });
  } catch (error) {
    await deleteFromS3(bucket, inputKey);
    throw error;
  }
  // The PostgreSQL row survives a lost or failed Redis publication.
  await publishPrintExport({ printExportId, courseId: owner.courseId }).catch(reportQueueError);
  return printExportId;
}

async function processPrintExport(printExportId: string) {
  const signal = shutdownController.signal;
  if (signal.aborted) return;
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
    if (printExport.attempts > MAX_ATTEMPTS) {
      throw new HttpStatusError(400, exhaustedFailureMessage(format));
    }
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
      label: getPrintExportLabel(work),
    });
    if (!finished) await deleteFromS3(bucket, outputKey);
  } catch (error) {
    if (signal.aborted) {
      // Another worker reruns the export once the reconciliation republishes it.
      await releasePrintExport(printExport.id).catch(reportQueueError);
      return;
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
        `The ${format === 'docx' ? 'Word document' : 'PDF'} could not be prepared because of a server error.`,
    });
  } finally {
    getHistogram(meter, 'print.export.duration', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    }).record(performance.now() - startedAt, attributes);
  }
}

function exhaustedFailureMessage(format: PrintExportWork['format']) {
  return format === 'docx'
    ? 'The Word document stopped repeatedly while rendering. Try again or contact support.'
    : 'The export stopped repeatedly while rendering. Try fewer forms or contact support.';
}

/** Republishes pending exports whose Redis job was lost, failed, or interrupted. */
export async function processQueuedPrintExports(): Promise<void> {
  const currentQueue = getQueue();
  if (!currentQueue) return;
  // Exports that no worker finished before they would expire, such as when no host runs a
  // worker, would otherwise stay pending and be republished forever.
  await failStalePrintExports();
  const pending = await selectPendingPrintExports();
  for (const { id, course_id } of pending) {
    if (shutdownController.signal.aborted) return;
    // Completed and failed jobs are removed from Redis, so they also read as unknown.
    const { state } = await currentQueue.getJobStatus(`print-export-${id}`);
    if (state === 'unknown') {
      await publishPrintExport({ printExportId: id, courseId: course_id });
    }
  }
}

export async function getPrintExportStream(key: string) {
  return await getFromS3(getFileStoreS3Bucket(), key, false);
}
