import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { PrintFormSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertPrintForm({
  assessmentId,
  userId,
  authnUserId,
}: {
  assessmentId: string;
  userId: string;
  authnUserId: string;
}) {
  return await queryRow(
    sql.insert_print_form,
    { assessment_id: assessmentId, user_id: userId, authn_user_id: authnUserId },
    PrintFormSchema,
  );
}

export async function selectOptionalPrintForm({
  printFormId,
  assessmentId,
  userId,
}: {
  printFormId: string;
  assessmentId: string;
  userId: string;
}) {
  return await queryOptionalRow(
    sql.select_optional_print_form,
    { print_form_id: printFormId, assessment_id: assessmentId, user_id: userId },
    PrintFormSchema,
  );
}

export async function selectPrintFormsForUser({
  assessmentId,
  userId,
}: {
  assessmentId: string;
  userId: string;
}) {
  return await queryRows(
    sql.select_print_forms_for_user,
    { assessment_id: assessmentId, user_id: userId },
    PrintFormSchema,
  );
}
