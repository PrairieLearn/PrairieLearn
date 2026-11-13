import { z } from 'zod';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryOptionalScalar,
  queryRow,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { PrintFormSchema } from '../lib/db-types.js';
import type { PrintSettings } from '../lib/printing/print-settings.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertPrintForm({
  assessmentId,
  userId,
  authnUserId,
  label,
  settings,
}: {
  assessmentId: string;
  userId: string;
  authnUserId: string;
  label: string;
  settings: PrintSettings;
}) {
  return await queryRow(
    sql.insert_print_form,
    {
      assessment_id: assessmentId,
      user_id: userId,
      authn_user_id: authnUserId,
      label,
      settings: JSON.stringify(settings),
    },
    PrintFormSchema,
  );
}

export async function lockAssessmentForPrintForms(assessmentId: string): Promise<void> {
  await queryScalar(sql.lock_assessment_for_print_forms, { assessment_id: assessmentId }, IdSchema);
}

export async function selectLatestPrintFormLabel(assessmentId: string): Promise<string | null> {
  return await queryOptionalScalar(
    sql.select_latest_print_form_label,
    { assessment_id: assessmentId },
    z.string(),
  );
}

export async function selectOptionalPrintForm({
  printFormId,
  assessmentId,
}: {
  printFormId: string;
  assessmentId: string;
}) {
  return await queryOptionalRow(
    sql.select_optional_print_form,
    { print_form_id: printFormId, assessment_id: assessmentId },
    PrintFormSchema,
  );
}

export async function selectPrintFormsForAssessment({ assessmentId }: { assessmentId: string }) {
  return await queryRows(
    sql.select_print_forms_for_assessment,
    { assessment_id: assessmentId },
    PrintFormSchema,
  );
}

export async function selectActivePrintFormsForAssessment({
  assessmentId,
}: {
  assessmentId: string;
}) {
  return await queryRows(
    sql.select_active_print_forms_for_assessment,
    { assessment_id: assessmentId },
    PrintFormSchema,
  );
}

export async function archivePrintForm({
  printFormId,
  assessmentId,
}: {
  printFormId: string;
  assessmentId: string;
}) {
  return await queryOptionalRow(
    sql.archive_print_form,
    { print_form_id: printFormId, assessment_id: assessmentId },
    PrintFormSchema,
  );
}
