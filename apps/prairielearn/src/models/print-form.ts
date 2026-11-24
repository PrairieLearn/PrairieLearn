import { isDeepStrictEqual } from 'node:util';

import { HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  queryScalar,
  queryScalars,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { PrintFormSchema } from '../lib/db-types.js';
import type { PaperSize } from '../lib/printing/paper-size.js';
import {
  PRINT_PAPER_SIZE_SHARED_MESSAGE,
  PRINT_QUESTION_SELECTION_LOCKED_MESSAGE,
  PRINT_SETTINGS_CHANGED_MESSAGE,
  type PrintSettings,
  sameExcludedQuestions,
} from '../lib/printing/print-settings.js';

import { selectPrintFormQuestions } from './print-form-question.js';

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

export async function updatePrintFormSettings({
  printFormId,
  assessmentId,
  settings,
  expectedSettings,
}: {
  printFormId: string;
  assessmentId: string;
  settings: PrintSettings;
  expectedSettings: PrintSettings;
}) {
  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessmentId);
    const current = await selectOptionalPrintForm({ printFormId, assessmentId });
    if (
      current?.archived_at === null &&
      current.question_selection_locked_at !== null &&
      !sameExcludedQuestions(current.settings.excludedQuestions, settings.excludedQuestions)
    ) {
      throw new HttpStatusError(409, PRINT_QUESTION_SELECTION_LOCKED_MESSAGE);
    }
    if (current?.archived_at === null && current.settings.paperSize !== settings.paperSize) {
      throw new HttpStatusError(409, PRINT_PAPER_SIZE_SHARED_MESSAGE);
    }
    if (current?.archived_at === null && !isDeepStrictEqual(current.settings, expectedSettings)) {
      throw new HttpStatusError(409, PRINT_SETTINGS_CHANGED_MESSAGE);
    }
    if (current?.archived_at === null) {
      const questions = await selectPrintFormQuestions(printFormId);
      assertSettingsMatchQuestions(
        settings,
        questions.map(({ print_form_question }) => print_form_question.question_number),
      );
    }
    return await queryOptionalRow(
      sql.update_print_form_settings,
      {
        print_form_id: printFormId,
        assessment_id: assessmentId,
        settings: JSON.stringify(settings),
      },
      PrintFormSchema,
    );
  });
}

export async function updatePrintFormPaperSize({
  printFormId,
  assessmentId,
  paperSize,
}: {
  printFormId: string;
  assessmentId: string;
  paperSize: PaperSize;
}) {
  return await queryOptionalRow(
    sql.update_print_form_paper_size,
    { print_form_id: printFormId, assessment_id: assessmentId, paper_size: paperSize },
    PrintFormSchema,
  );
}

export async function lockPrintFormQuestionSelections({
  assessmentId,
  printFormIds,
}: {
  assessmentId: string;
  printFormIds: string[];
}) {
  await execute(sql.lock_print_form_question_selections, {
    assessment_id: assessmentId,
    print_form_ids: printFormIds,
  });
}

export async function lockAssessmentForPrintForms(assessmentId: string): Promise<void> {
  await queryScalar(sql.lock_assessment_for_print_forms, { assessment_id: assessmentId }, IdSchema);
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

export async function selectRandomizablePrintFormIds(assessmentId: string) {
  return await queryScalars(
    sql.select_randomizable_print_form_ids,
    { assessment_id: assessmentId },
    IdSchema,
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

/** Rejects settings that name questions outside the form, which would break its previews. */
export function assertSettingsMatchQuestions(
  settings: PrintSettings,
  questionNumbers: Iterable<string>,
): void {
  const numbers = new Set(questionNumbers);
  if (
    !Object.keys(settings.questionSizes).every((number) => numbers.has(number)) ||
    !settings.excludedQuestions.every((number) => numbers.has(number))
  ) {
    throw new HttpStatusError(
      400,
      'These print settings refer to questions that are not in this form.',
    );
  }
}
