import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type PrintExport, PrintExportSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertPrintExport({
  assessmentId,
  userId,
  authnUserId,
  format,
  filename,
  label,
  inputKey,
}: {
  assessmentId: string;
  userId: string;
  authnUserId: string;
  format: PrintExport['format'];
  filename: string;
  label: string;
  inputKey: string;
}): Promise<string> {
  return await queryScalar(
    sql.insert_print_export,
    {
      assessment_id: assessmentId,
      user_id: userId,
      authn_user_id: authnUserId,
      format,
      filename,
      label,
      input_key: inputKey,
    },
    IdSchema,
  );
}

const PrintExportWithExpirySchema = PrintExportSchema.extend({ expired: z.boolean() });
const RecentPrintExportSchema = PrintExportSchema.pick({
  id: true,
  created_at: true,
  status: true,
  format: true,
  filename: true,
  label: true,
  size_bytes: true,
  failure_message: true,
});

/** Downloads expire 24 hours after the export was queued. */
export async function selectOptionalPrintExport({
  printExportId,
  assessmentId,
  authnUserId,
}: {
  printExportId: string;
  assessmentId: string;
  authnUserId: string;
}) {
  return await queryOptionalRow(
    sql.select_print_export,
    { id: printExportId, assessment_id: assessmentId, authn_user_id: authnUserId },
    PrintExportWithExpirySchema,
  );
}

/** Recent exports are limited to their 24-hour download window. */
export async function selectRecentPrintExportsForAssessment({
  assessmentId,
  authnUserId,
}: {
  assessmentId: string;
  authnUserId: string;
}) {
  return await queryRows(
    sql.select_recent_print_exports_for_assessment,
    { assessment_id: assessmentId, authn_user_id: authnUserId },
    RecentPrintExportSchema,
  );
}

export async function selectPendingPrintExports() {
  return await queryRows(
    sql.select_pending_print_exports,
    z.object({ id: IdSchema, course_id: IdSchema }),
  );
}

/** Counts an attempt and returns the export, or null if it is no longer pending. */
export async function claimPrintExport(id: string): Promise<PrintExport | null> {
  return await queryOptionalRow(sql.claim_print_export, { id }, PrintExportSchema);
}

/** Returns the attempt of a run that stopped for a graceful shutdown. */
export async function releasePrintExport(id: string) {
  await execute(sql.release_print_export, { id });
}

/** Returns false if the export was already finished, e.g. by a duplicate run. */
export async function finishPrintExport(
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

export async function failStalePrintExports() {
  await execute(sql.fail_stale_print_exports);
}
