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
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { Queue, Worker } from '@prairielearn/prairiemq';
import * as Sentry from '@prairielearn/sentry';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';
import { getFileStoreS3Bucket } from './file-store.js';
import { type PrintExportWork, renderPrintExport } from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';
import { DocxSourceSchema } from './printing/docx-source-schema.js';
import { PAPER_SIZES } from './printing/pdf-output.js';
import { PrintAssetScopeDataSchema } from './printing/print-asset-access.js';
import { PrintableCoverSchema } from './printing/printable-cover.js';

const sql = loadSqlEquiv(import.meta.url);
const KEY_PREFIX = 'print-exports/';
const PRINT_EXPORT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const QUEUE_NAME = 'print-exports';
let queue: Queue<{ jobId: string }, void> | null = null;
let worker: Worker<{ jobId: string }, void> | null = null;
let workerClosing: Promise<void> | null = null;
let printExportShutdownController = new AbortController();

function isAborted(signal: AbortSignal): boolean {
  // The signal can change while a worker is awaiting S3 or browser work.
  return signal.aborted;
}

function reportQueueError(error: unknown) {
  logger.error('Print export queue error', error);
  Sentry.captureException(error);
}

export async function initPrintExportQueue(): Promise<void> {
  if (queue || !config.nonVolatileRedisUrl) return;
  const connection = {
    redisUrl: config.nonVolatileRedisUrl,
    prefix:
      config.printExportQueuePrefix ??
      `prairielearn-print-exports-${createHash('sha256')
        .update(JSON.stringify([config.postgresqlHost, config.postgresqlDatabase]))
        .digest('hex')}`,
  };
  queue = new Queue(QUEUE_NAME, {
    ...connection,
    defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
  });
  queue.on('error', reportQueueError);
  const currentWorker = new Worker<{ jobId: string }, void>(
    QUEUE_NAME,
    async (job) => await processPrintExportJob(IdSchema.parse(job.data.jobId)),
    {
      ...connection,
      concurrency: 2,
      groupConcurrency: 2,
      maxStalledCount: 2,
      lockDuration: 300_000,
      autorun: false,
    },
  );
  worker = currentWorker;
  currentWorker.on('error', reportQueueError);
  currentWorker.on('failed', (_job, error) => reportQueueError(error));
  try {
    await queue.waitUntilReady();
    await currentWorker.preflight();
    currentWorker.run();
    await currentWorker.waitUntilReady();
    currentWorker.on('error', () => {
      // A fatal PrairieMQ error closes the worker; stop accepting exports until restart.
      void currentWorker.waitUntilReady().catch(() => {
        beginPrintExportShutdown();
        void waitForPrintExportWorkers().catch(reportQueueError);
      });
    });
    await processQueuedPrintExports();
  } catch (error) {
    beginPrintExportShutdown();
    await waitForPrintExportWorkers();
    throw error;
  }
}

export function beginPrintExportShutdown() {
  printExportShutdownController.abort();
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
    printExportShutdownController = new AbortController();
  }
}

async function publishPrintExport(jobId: string) {
  if (queue && !isAborted(printExportShutdownController.signal)) {
    await queue.add('render', { jobId }, { jobId: `print-export-${jobId}` });
  }
}

const PrintExportFormatSchema = z.enum(['pdf', 'docx']);
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

const PrintExportJobSchema = z.object({
  status: z.enum(['Running', 'Success', 'Error', 'Stopped', 'Stopping']),
  finish_date: DateFromISOString.nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
});

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

interface PrintExportOwner {
  assessmentId: string;
  authnUserId: string;
  courseId: string;
  courseInstanceId: string;
  userId: string;
}

async function insertPrintExportJob({
  owner,
  filename,
  data,
}: {
  owner: PrintExportOwner;
  filename: string;
  data: Record<string, unknown>;
}) {
  return await runInTransactionAsync(async () => {
    await execute(sql.lock_course_job_sequence, { course_id: owner.courseId });
    const row = await queryRow(
      sql.insert_print_export_job,
      {
        course_id: owner.courseId,
        course_instance_id: owner.courseInstanceId,
        assessment_id: owner.assessmentId,
        user_id: owner.userId,
        authn_user_id: owner.authnUserId,
        description: `Generate ${filename}`,
        data: JSON.stringify(data),
      },
      z.object({ job_id: IdSchema, job_sequence_id: IdSchema }),
    );
    return row;
  });
}

export async function queuePrintExport({
  owner,
  work,
}: {
  owner: PrintExportOwner;
  work: PrintExportWork;
}) {
  if (!queue || isAborted(printExportShutdownController.signal)) {
    throw new HttpStatusError(503, 'Print export queuing is not available on this server.');
  }
  const bucket = getFileStoreS3Bucket();
  const inputKey = `${KEY_PREFIX}input/${randomUUID()}.json`;
  await uploadToS3(bucket, inputKey, null, false, Buffer.from(JSON.stringify(work)));
  let job: { job_id: string; job_sequence_id: string };
  try {
    job = await insertPrintExportJob({
      owner,
      filename: work.filename,
      data: { inputKey, filename: work.filename, document: work.document, format: work.format },
    });
  } catch (error) {
    await deleteFromS3(bucket, inputKey);
    throw error;
  }
  // The accepted PostgreSQL job survives a lost or failed Redis publication.
  await publishPrintExport(job.job_id).catch(reportQueueError);
  return job.job_sequence_id;
}

async function finishPrintExport({
  id,
  jobSequenceId,
  owner,
  status,
  data,
  output,
}: {
  id: string;
  jobSequenceId: string;
  owner: string;
  status: 'Success' | 'Error';
  data: Record<string, unknown>;
  output: string;
}) {
  return await runInTransactionAsync(async () => {
    const updated = await execute(sql.finish_print_export_job, {
      job_id: id,
      owner,
      status,
      data: JSON.stringify(data),
      output,
    });
    if (updated === 0) return false;
    await execute(sql.finish_print_export_sequence, { job_sequence_id: jobSequenceId, status });
    return true;
  });
}

async function processPrintExportJob(jobId: string, terminalFailure?: string) {
  const shutdownSignal = printExportShutdownController.signal;
  if (isAborted(shutdownSignal)) return;
  const owner = randomUUID();
  const job = await queryOptionalRow(
    sql.claim_print_export_job,
    { job_id: jobId, owner },
    z.object({
      id: IdSchema,
      job_sequence_id: IdSchema,
      queued_at: DateFromISOString,
      input_key: z.string(),
      document: z.enum(['assessment', 'answer_key', 'booklet']),
      format: PrintExportFormatSchema,
      attempts: z.number().int(),
    }),
  );
  if (!job || isAborted(shutdownSignal)) return;
  const {
    id,
    job_sequence_id: jobSequenceId,
    input_key: inputKey,
    document,
    format,
    attempts,
  } = job;
  const bucket = getFileStoreS3Bucket();
  const meter = metrics.getMeter('prairielearn');
  const attributes = { document, format };
  const startedAt = performance.now();
  getHistogram(metrics.getMeter('prairielearn'), 'print.export.background.queue_wait', {
    unit: 'milliseconds',
    valueType: ValueType.DOUBLE,
  }).record(Date.now() - job.queued_at.getTime(), { document: job.document, format: job.format });
  let inputCanBeDeleted = false;
  try {
    let persisted: z.infer<typeof PersistedWorkSchema>;
    let packet: Buffer;
    try {
      if (terminalFailure || attempts > 3) {
        throw new HttpStatusError(400, terminalFailure ?? exhaustedFailureMessage(format));
      }
      persisted = PersistedWorkSchema.parse(
        JSON.parse((await getFromS3(bucket, inputKey, true)).toString('utf8')),
      );
      packet = await renderPrintExport(persisted, shutdownSignal);
    } catch (error) {
      if (isAborted(shutdownSignal)) return;
      getCounter(meter, 'print.export.background.failures', { valueType: ValueType.INT }).add(
        1,
        attributes,
      );
      const failureMessage = printableFailureMessage(error, format);
      if (failureMessage === null) {
        Sentry.captureException(error, {
          tags: {
            'job_sequence.id': jobSequenceId,
            'job_sequence.type': 'print_export',
          },
          extra: { document },
        });
      }
      inputCanBeDeleted = await finishPrintExport({
        id,
        jobSequenceId,
        owner,
        status: 'Error',
        data: {
          inputKey,
          format,
          document,
          failureMessage:
            failureMessage ??
            `The ${format === 'docx' ? 'Word document' : 'PDF'} could not be prepared because of a server error.`,
        },
        output: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      return;
    }
    if (isAborted(shutdownSignal)) return;
    const key = `${KEY_PREFIX}${randomUUID()}.${persisted.format}`;
    try {
      await uploadToS3(bucket, key, null, false, packet);
      if (isAborted(shutdownSignal)) return;
      inputCanBeDeleted = await finishPrintExport({
        id,
        jobSequenceId,
        owner,
        status: 'Success',
        data: {
          inputKey,
          key,
          filename: persisted.filename,
          document,
          format: persisted.format,
          exportLabel: getPrintExportLabel(persisted),
          sizeBytes: packet.length,
        },
        output: `${format === 'docx' ? 'Word document' : 'PDF'} ready to download`,
      });
    } finally {
      if (!inputCanBeDeleted) {
        await deleteFromS3(bucket, key);
      }
    }
    getHistogram(meter, 'print.export.output_bytes', {
      unit: 'bytes',
      valueType: ValueType.INT,
    }).record(packet.length, attributes);
  } finally {
    if (inputCanBeDeleted) {
      try {
        await deleteFromS3(bucket, inputKey);
        await execute(sql.clear_print_export_input_key, { job_id: id, input_key: inputKey });
      } catch (error) {
        logger.error('Could not remove completed print export input', error);
      }
    }
    getHistogram(meter, 'print.export.background.duration', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    }).record(performance.now() - startedAt, attributes);
    getHistogram(meter, 'print.export.background.rss', {
      unit: 'bytes',
      valueType: ValueType.INT,
    }).record(process.memoryUsage().rss, attributes);
  }
}

function exhaustedFailureMessage(format: PrintExportWork['format']) {
  return format === 'docx'
    ? 'The Word document stopped repeatedly while rendering. Try again or contact support.'
    : 'The export stopped repeatedly while rendering. Try fewer forms or contact support.';
}

/** Repairs accepted PostgreSQL jobs whose Redis publication was lost or failed. */
export async function processQueuedPrintExports(): Promise<void> {
  const currentQueue = queue;
  const signal = printExportShutdownController.signal;
  if (!currentQueue || isAborted(signal)) return;
  let afterId = '0';
  while (!isAborted(signal)) {
    const pending = await queryRows(
      sql.select_pending_print_exports,
      { after_id: afterId },
      z.object({ id: IdSchema, format: PrintExportFormatSchema }),
    );
    for (const job of pending) {
      if (isAborted(signal)) return;
      const { state } = await currentQueue.getJobStatus(`print-export-${job.id}`);
      if (isAborted(signal)) return;
      if (state === 'unknown') {
        await publishPrintExport(job.id);
      } else if (state === 'failed') {
        await processPrintExportJob(job.id, exhaustedFailureMessage(job.format));
      }
    }
    if (pending.length < 100) return;
    afterId = pending.at(-1)!.id;
  }
}

export async function selectPrintExportJob({
  jobSequenceId,
  assessmentId,
  authnUserId,
}: {
  jobSequenceId: string;
  assessmentId: string;
  authnUserId: string;
}) {
  const job = await queryOptionalRow(
    sql.select_print_export_job,
    { job_sequence_id: jobSequenceId, assessment_id: assessmentId, authn_user_id: authnUserId },
    PrintExportJobSchema,
  );
  if (!job) return null;
  const result = z
    .object({
      key: z.string(),
      filename: z.string(),
      document: z.enum(['assessment', 'answer_key', 'booklet']),
      format: PrintExportFormatSchema,
      exportLabel: z.string().optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
    })
    .safeParse(job.data);
  const failure = z.object({ failureMessage: z.string() }).safeParse(job.data);
  return {
    status: job.status,
    format: z.object({ format: PrintExportFormatSchema }).parse(job.data).format,
    failureMessage: job.status === 'Error' && failure.success ? failure.data.failureMessage : null,
    result:
      job.status === 'Success' &&
      job.finish_date &&
      Date.now() - job.finish_date.getTime() < PRINT_EXPORT_EXPIRY_MS &&
      result.success
        ? result.data
        : null,
  };
}

export async function getPrintExportStream(key: string) {
  return await getFromS3(getFileStoreS3Bucket(), key, false);
}

export async function cleanExpiredPrintExports() {
  while (true) {
    const expired = await queryRows(
      sql.select_expired_print_exports,
      {},
      z.object({ id: IdSchema, key: z.string() }),
    );
    if (expired.length === 0) return;
    for (const { id, key } of expired) {
      await deleteFromS3(getFileStoreS3Bucket(), key);
      await execute(sql.mark_print_export_expired, { job_id: id, key });
    }
  }
}
