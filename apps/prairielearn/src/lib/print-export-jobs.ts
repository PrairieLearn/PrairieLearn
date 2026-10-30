import { randomUUID } from 'node:crypto';

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
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { deleteFromS3, getFromS3, uploadToS3 } from './aws.js';
import { decryptFromStorage, encryptForStorage } from './encrypted-storage.js';
import { getFileStoreS3Bucket } from './file-store.js';
import { type PrintExportWork, renderPrintExport } from './print-export-render.js';
import { PrintPacketError } from './print-packet.js';
import { PrintPdfAccessibilityError } from './printing/pdf-accessibility-error.js';
import { PAPER_SIZES } from './printing/pdf-output.js';

const sql = loadSqlEquiv(import.meta.url);
const KEY_PREFIX = 'print-exports/';
const WORKER_LIMIT = 2;
const PRINT_EXPORT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const activePrintExports = new Set<Promise<void>>();
let printExportShutdownController = new AbortController();

function isAborted(signal: AbortSignal): boolean {
  // The signal can change while a worker is awaiting S3 or browser work.
  return signal.aborted;
}

export function beginPrintExportShutdown() {
  printExportShutdownController.abort();
}

export async function waitForPrintExportWorkers() {
  await Promise.allSettled(activePrintExports);
  // Vite can restart the server without restarting this process.
  printExportShutdownController = new AbortController();
}

const PersistedWorkSchema = z.object({
  document: z.enum(['assessment', 'answer_key', 'booklet']),
  copies: z.number().int().positive(),
  filename: z.string(),
  snapshots: z.array(
    z.object({
      formLabel: z.string(),
      paperSize: z.enum(PAPER_SIZES),
      printDocument: z.enum(['assessment', 'answer_key']),
      localPreviewUrl: z.url(),
      html: z.string(),
    }),
  ),
  covers: z.array(z.object({ name: z.string(), base64: z.string() })),
  encryptedCookieHeader: z.string().optional(),
});

const PrintExportJobSchema = z.object({
  status: z.enum(['Running', 'Success', 'Error', 'Stopped', 'Stopping']),
  finish_date: DateFromISOString.nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
});

function getPrintExportLabel({ document, copies, snapshots }: PrintExportWork): string {
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

function printableFailureMessage(error: unknown): string | null {
  if (
    error instanceof Error &&
    /^Timed out after \d+ ms (waiting to render|rendering) the /.test(error.message)
  ) {
    return 'Rendering took too long. Try again, or export fewer forms at once.';
  }
  if (
    error instanceof PrintPacketError ||
    error instanceof PrintPdfAccessibilityError ||
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
  status,
  data,
}: {
  owner: PrintExportOwner;
  filename: string;
  status: 'Running' | 'Success';
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
        status,
        data: JSON.stringify(data),
      },
      z.object({ job_sequence_id: IdSchema }),
    );
    return row.job_sequence_id;
  });
}

export async function queuePrintExport({
  owner,
  work,
}: {
  owner: PrintExportOwner;
  work: PrintExportWork;
}) {
  const bucket = getFileStoreS3Bucket();
  const inputKey = `${KEY_PREFIX}input/${randomUUID()}.json`;
  const { cookieHeader, ...rest } = work;
  const persisted = {
    ...rest,
    ...(cookieHeader ? { encryptedCookieHeader: encryptForStorage(cookieHeader) } : {}),
  };
  await uploadToS3(bucket, inputKey, null, false, Buffer.from(JSON.stringify(persisted)));
  try {
    return await insertPrintExportJob({
      owner,
      filename: work.filename,
      status: 'Running',
      data: { inputKey, filename: work.filename, document: work.document },
    });
  } catch (error) {
    await deleteFromS3(bucket, inputKey);
    throw error;
  }
}

export async function storeCompletedPrintExport({
  owner,
  packet,
  work,
}: {
  owner: PrintExportOwner;
  packet: Buffer;
  work: PrintExportWork;
}) {
  const bucket = getFileStoreS3Bucket();
  const key = `${KEY_PREFIX}${randomUUID()}.pdf`;
  await uploadToS3(bucket, key, null, false, packet);
  try {
    return await insertPrintExportJob({
      owner,
      filename: work.filename,
      status: 'Success',
      data: {
        key,
        filename: work.filename,
        document: work.document,
        exportLabel: getPrintExportLabel(work),
        sizeBytes: packet.length,
      },
    });
  } catch (error) {
    await deleteFromS3(bucket, key);
    throw error;
  }
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

async function runClaimedPrintExport({
  id,
  jobSequenceId,
  inputKey,
  document,
  owner,
}: {
  id: string;
  jobSequenceId: string;
  inputKey: string;
  document: PrintExportWork['document'];
  owner: string;
}) {
  const bucket = getFileStoreS3Bucket();
  const meter = metrics.getMeter('prairielearn');
  const attributes = { document };
  const startedAt = performance.now();
  const shutdownSignal = printExportShutdownController.signal;
  const heartbeat = setInterval(() => {
    if (isAborted(shutdownSignal)) return;
    void execute(sql.renew_print_export_lease, { job_id: id, owner }).catch((error: unknown) => {
      logger.error('Could not renew print export lease', error);
    });
  }, 60_000);
  let inputCanBeDeleted = false;
  try {
    let persisted: z.infer<typeof PersistedWorkSchema>;
    let packet: Buffer;
    try {
      persisted = PersistedWorkSchema.parse(
        JSON.parse((await getFromS3(bucket, inputKey, true)).toString('utf8')),
      );
      const { encryptedCookieHeader, ...rest } = persisted;
      packet = await renderPrintExport(
        {
          ...rest,
          cookieHeader: encryptedCookieHeader
            ? decryptFromStorage(encryptedCookieHeader)
            : undefined,
        },
        undefined,
        shutdownSignal,
      );
    } catch (error) {
      if (isAborted(shutdownSignal)) return;
      getCounter(meter, 'print.export.background.failures', { valueType: ValueType.INT }).add(
        1,
        attributes,
      );
      const failureMessage =
        printableFailureMessage(error) ??
        'The PDF could not be prepared because of a server error.';
      inputCanBeDeleted = await finishPrintExport({
        id,
        jobSequenceId,
        owner,
        status: 'Error',
        data: { inputKey, failureMessage },
        output: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      return;
    }
    if (isAborted(shutdownSignal)) return;
    const key = `${KEY_PREFIX}${randomUUID()}.pdf`;
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
          exportLabel: getPrintExportLabel(persisted),
          sizeBytes: packet.length,
        },
        output: 'PDF ready to download',
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
    clearInterval(heartbeat);
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

/** Claims a shared pool of queued exports; expired leases are claimed again after a restart. */
export async function processQueuedPrintExports(): Promise<void> {
  if (isAborted(printExportShutdownController.signal)) return;
  const owner = randomUUID();
  const { claimed, exhausted } = await runInTransactionAsync(async () => {
    await execute(sql.lock_print_export_queue, {});
    const exhausted = await queryRows(
      sql.fail_exhausted_print_exports,
      {},
      z.object({ id: IdSchema, input_key: z.string() }),
    );
    const claimed = await queryRows(
      sql.claim_print_exports,
      { owner, limit: WORKER_LIMIT },
      z.object({
        id: IdSchema,
        job_sequence_id: IdSchema,
        queued_at: DateFromISOString,
        input_key: z.string(),
        document: z.enum(['assessment', 'answer_key', 'booklet']),
      }),
    );
    return { claimed, exhausted };
  });
  for (const job of exhausted) {
    try {
      await deleteFromS3(getFileStoreS3Bucket(), job.input_key);
      await execute(sql.clear_print_export_input_key, {
        job_id: job.id,
        input_key: job.input_key,
      });
    } catch (error) {
      logger.error('Could not remove failed print export input', error);
    }
  }
  for (const job of claimed) {
    if (isAborted(printExportShutdownController.signal)) return;
    getHistogram(metrics.getMeter('prairielearn'), 'print.export.background.queue_wait', {
      unit: 'milliseconds',
      valueType: ValueType.DOUBLE,
    }).record(Date.now() - job.queued_at.getTime(), { document: job.document });
    const worker = runClaimedPrintExport({
      id: job.id,
      jobSequenceId: job.job_sequence_id,
      inputKey: job.input_key,
      document: job.document,
      owner,
    })
      .catch((error: unknown) => {
        logger.error('Print export worker failed', error);
      })
      .finally(() => {
        activePrintExports.delete(worker);
      });
    activePrintExports.add(worker);
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
      exportLabel: z.string().optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
    })
    .safeParse(job.data);
  const failure = z.object({ failureMessage: z.string() }).safeParse(job.data);
  return {
    status: job.status,
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
