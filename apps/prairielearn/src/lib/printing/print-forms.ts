import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { insertPrintFormQuestions } from '../../models/print-form-question.js';
import {
  archivePrintForm,
  insertPrintForm,
  lockAssessmentForPrintForms,
  selectActivePrintFormsForAssessment,
  selectPrintFormsForAssessment,
} from '../../models/print-form.js';
import { selectAssessmentQuestionIdsForInstance } from '../assessment.js';
import { printFormLabelBase } from '../client/printing/print-form-label.js';
import { MAX_ACTIVE_PRINT_FORMS } from '../client/printing/print-form-limits.js';
import {
  type Assessment,
  AssessmentQuestionSchema,
  type Course,
  type CourseInstance,
  type PrintForm,
  type PrintFormQuestion,
  QuestionSchema,
} from '../db-types.js';
import { ensureVariant, getQuestionCourse } from '../question-variant.js';

import { DEFAULT_PRINT_SETTINGS } from './print-settings.js';

const sql = loadSqlEquiv(import.meta.url);

function nextLetter(previous: string): string {
  const letters = previous.split('');
  for (let index = letters.length - 1; index >= 0; index--) {
    if (letters[index] !== 'Z') {
      letters[index] = String.fromCharCode(letters[index].charCodeAt(0) + 1);
      return letters.join('');
    }
    letters[index] = 'A';
  }
  return `A${letters.join('')}`;
}

export function nextPrintFormLabel(
  forms: Pick<PrintForm, 'label' | 'archived_at'>[],
  replacesLabel?: string,
): string {
  let base: string;
  if (replacesLabel) {
    base = printFormLabelBase(replacesLabel);
  } else {
    const activeBases = new Set(
      forms
        .filter((form) => form.archived_at === null)
        .map((form) => printFormLabelBase(form.label)),
    );
    base = 'A';
    while (activeBases.has(base)) base = nextLetter(base);
  }

  let latestVersion = 0;
  for (const form of forms) {
    if (printFormLabelBase(form.label) === base) {
      latestVersion = Math.max(latestVersion, Number(form.label.slice(base.length)) || 1);
    }
  }
  return `${base}${latestVersion + 1}`;
}

function assertCanCreatePrintForm(activeForms: PrintForm[], replacesPrintFormId?: string) {
  if (replacesPrintFormId) {
    if (!activeForms.some((form) => form.id === replacesPrintFormId)) {
      throw new HttpStatusError(404, 'The form to regenerate is no longer active.');
    }
  } else if (activeForms.length >= MAX_ACTIVE_PRINT_FORMS) {
    throw new HttpStatusError(
      400,
      `An assessment can have at most ${MAX_ACTIVE_PRINT_FORMS} active print forms.`,
    );
  }
}

interface CreatePrintFormOptions {
  assessment: Assessment;
  course: Course;
  courseInstance: CourseInstance;
  userId: string;
  authnUserId: string;
  replacesPrintFormId?: string;
}

/** Creates an independent form with saved question selection, ordering, and variants. */
export async function createPrintForm(options: CreatePrintFormOptions) {
  return await createPrintFormInternal({ ...options, ensureInitial: false });
}

/** Returns the active A form, creating its first version when needed. */
export async function ensureInitialPrintForm(
  options: Omit<CreatePrintFormOptions, 'replacesPrintFormId'>,
) {
  return await createPrintFormInternal({ ...options, ensureInitial: true });
}

async function createPrintFormInternal({
  assessment,
  course,
  courseInstance,
  userId,
  authnUserId,
  replacesPrintFormId,
  ensureInitial,
}: CreatePrintFormOptions & { ensureInitial: boolean }) {
  const initialActiveForms = await selectActivePrintFormsForAssessment({
    assessmentId: assessment.id,
  });
  if (ensureInitial) {
    const existing = initialActiveForms.find((form) => printFormLabelBase(form.label) === 'A');
    if (existing) return existing;
  }
  assertCanCreatePrintForm(initialActiveForms, replacesPrintFormId);
  const assessmentQuestionIds = await selectAssessmentQuestionIdsForInstance({
    assessment_id: assessment.id,
    assessment_instance_id: null,
  });
  const selectedQuestions = await queryRows(
    sql.select_questions_for_new_form,
    { assessment_question_ids: assessmentQuestionIds },
    z.object({
      assessment_question: AssessmentQuestionSchema,
      question: QuestionSchema,
      position: z.number(),
      question_number: z.string(),
    }),
  );
  if (selectedQuestions.length === 0) {
    throw new HttpStatusError(400, 'This assessment has no questions to print.');
  }

  // Variant generation runs question code, so keep it outside the assessment lock and recheck
  // the form state once the lock is held.
  const questions: Omit<PrintFormQuestion, 'id' | 'print_form_id'>[] = [];
  for (const selected of selectedQuestions) {
    const variant = await ensureVariant({
      question_id: selected.question.id,
      instance_question_id: null,
      user_id: userId,
      authn_user_id: authnUserId,
      course_instance: courseInstance,
      variant_course: course,
      question_course: await getQuestionCourse(selected.question, course),
      options: { preferences: selected.assessment_question.preferences ?? {} },
      require_open: false,
      client_fingerprint_id: null,
    });
    questions.push({
      assessment_question_id: selected.assessment_question.id,
      variant_id: variant.id,
      position: selected.position,
      question_number: selected.question_number,
      max_points: selected.assessment_question.max_points ?? 0,
    });
  }

  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessment.id);
    const forms = await selectPrintFormsForAssessment({ assessmentId: assessment.id });
    const activeForms = forms.filter((form) => form.archived_at === null);
    if (ensureInitial) {
      const existing = activeForms.find((form) => printFormLabelBase(form.label) === 'A');
      if (existing) return existing;
    }
    assertCanCreatePrintForm(activeForms, replacesPrintFormId);
    const replacedForm = replacesPrintFormId
      ? activeForms.find((form) => form.id === replacesPrintFormId)
      : undefined;
    const label = nextPrintFormLabel(forms, replacedForm?.label);
    const form = await insertPrintForm({
      assessmentId: assessment.id,
      userId,
      authnUserId,
      label,
      settings: {
        ...DEFAULT_PRINT_SETTINGS,
        includeHonorCode: !!assessment.require_honor_code,
      },
    });
    await insertPrintFormQuestions({ printFormId: form.id, questions });
    if (replacesPrintFormId) {
      const archived = await archivePrintForm({
        printFormId: replacesPrintFormId,
        assessmentId: assessment.id,
      });
      if (!archived) throw new HttpStatusError(409, 'The form to regenerate is no longer active.');
    }
    return form;
  });
}
