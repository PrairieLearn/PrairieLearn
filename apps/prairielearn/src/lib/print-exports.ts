import { createHash, randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { ValueType, getCounter, getHistogram, metrics } from '@prairielearn/opentelemetry';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';
import { Queue, Worker } from '@prairielearn/prairiemq';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';
import { PrintExportSchema } from './db-types.js';
import { getFileStoreS3Bucket } from './file-store.js';
import { type PrintExportWork, renderPrintExport } from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';
import { DocxSourceSchema } from './printing/docx-source-schema.js';
import { isBrowserRenderingAvailable } from './printing/index.js';
import { PAPER_SIZES } from './printing/pdf-output.js';
import { PrintAssetScopeDataSchema } from './printing/print-asset-access.js';
import { PrintableCoverSchema } from './printing/printable-cover.js';

const sql = loadSqlEquiv(import.meta.url);
const KEY_PREFIX = 'print-exports/';
const QUEUE_NAME = 'print-exports';
// Each course gets a fair share of the workers; total throughput scales with the number of workers.
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

/** Starts this host's export worker. Errors are reported instead of failing startup. */
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

const PersistedSnapshotSchema = z.object({
  formLabel: z.string(),
  paperSize: z.enum(PAPER_SIZES),
  printDocument: z.enum(['assessment', 'answer_key']),
  localPreviewUrl: z.url(),
  html: z.string(),
  assetScope: PrintAssetScopeDataSchema,
});
const PersistedWorkSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('pdf'),
    document: z.enum(['assessment', 'answer_key', 'booklet']),
    copies: z.number().int().positive(),
    filename: z.string(),
    snapshots: z.array(PersistedSnapshotSchema),
    covers: z.array(z.object({ name: z.string(), base64: z.string() })),
  }),
  z.object({
    format: z.literal('docx'),
    document: z.enum(['assessment', 'answer_key']),
    filename: z.string(),
    snapshot: PersistedSnapshotSchema,
    source: DocxSourceSchema,
    cover: PrintableCoverSchema.optional(),
    footerLabel: z.string(),
  }),
]) satisfies z.ZodType<PrintExportWork>;

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
  if (!getQueue() || shutdownController.signal.aborted) {
    throw new HttpStatusError(503, 'Print export queuing is not available on this server.');
  }
  const bucket = getFileStoreS3Bucket();
  const inputKey = `${KEY_PREFIX}input/${randomUUID()}.json`;
  await uploadToS3(bucket, inputKey, null, false, Buffer.from(JSON.stringify(work)));
  let printExportId: string;
  try {
    printExportId = await queryScalar(
      sql.insert_print_export,
      {
        assessment_id: owner.assessmentId,
        user_id: owner.userId,
        authn_user_id: owner.authnUserId,
        format: work.format,
        filename: work.filename,
        input_key: inputKey,
      },
      IdSchema,
    );
  } catch (error) {
    await deleteFromS3(bucket, inputKey);
    throw error;
  }
  // The PostgreSQL row survives a lost or failed Redis publication.
  await publishPrintExport({ printExportId, courseId: owner.courseId }).catch(reportQueueError);
  return printExportId;
}

async function finishPrintExport(
  id: string,
  result:
    | { status: 'succeeded'; outputKey: string; sizeBytes: number; label: string }
    | { status: 'failed'; failureMessage: string },
): Promise<boolean> {
  const updated = await execute(sql.finish_print_export, {
    id,
    status: result.status,
    output_key: result.status === 'succeeded' ? result.outputKey : null,
    size_bytes: result.status === 'succeeded' ? result.sizeBytes : null,
    label: result.status === 'succeeded' ? result.label : null,
    failure_message: result.status === 'failed' ? result.failureMessage : null,
  });
  return updated > 0;
}

async function processPrintExport(printExportId: string) {
  const signal = shutdownController.signal;
  if (signal.aborted) return;
  const printExport = await queryOptionalRow(
    sql.claim_print_export,
    { id: printExportId },
    PrintExportSchema,
  );
  if (!printExport) return;
  const { format } = printExport;
  const bucket = getFileStoreS3Bucket();
  const meter = metrics.getMeter('prairielearn');
  const attributes = { format };
  getHistogram(meter, 'print.export.background.queue_wait', {
    unit: 'milliseconds',
    valueType: ValueType.DOUBLE,
  }).record(Date.now() - printExport.created_at.getTime(), attributes);
  const startedAt = performance.now();
  try {
    if (printExport.attempts > MAX_ATTEMPTS) {
      throw new HttpStatusError(400, exhaustedFailureMessage(format));
    }
    const work = PersistedWorkSchema.parse(
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
    getHistogram(meter, 'print.export.output_bytes', {
      unit: 'bytes',
      valueType: ValueType.INT,
    }).record(packet.length, attributes);
  } catch (error) {
    if (signal.aborted) {
      // Another worker reruns the export once the reconciliation republishes it.
      await execute(sql.release_print_export, { id: printExport.id }).catch(reportQueueError);
      return;
    }
    getCounter(meter, 'print.export.background.failures', { valueType: ValueType.INT }).add(
      1,
      attributes,
    );
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
    getHistogram(meter, 'print.export.background.duration', {
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
  const pending = await queryRows(
    sql.select_pending_print_exports,
    z.object({ id: IdSchema, course_id: IdSchema }),
  );
  for (const { id, course_id } of pending) {
    if (shutdownController.signal.aborted) return;
    // Completed and failed jobs are removed from Redis, so they also read as unknown.
    const { state } = await currentQueue.getJobStatus(`print-export-${id}`);
    if (state === 'unknown') {
      await publishPrintExport({ printExportId: id, courseId: course_id });
    }
  }
}

const SelectedPrintExportSchema = PrintExportSchema.extend({ expired: z.boolean() });

/** Returns an export owned by this user, or null. Downloads expire 24 hours after queueing. */
export async function selectPrintExport({
  printExportId,
  assessmentId,
  authnUserId,
}: {
  printExportId: string;
  assessmentId: string;
  authnUserId: string;
}): Promise<z.infer<typeof SelectedPrintExportSchema> | null> {
  return await queryOptionalRow(
    sql.select_print_export,
    { id: printExportId, assessment_id: assessmentId, authn_user_id: authnUserId },
    SelectedPrintExportSchema,
  );
}

export async function getPrintExportStream(key: string) {
  return await getFromS3(getFileStoreS3Bucket(), key, false);
}
