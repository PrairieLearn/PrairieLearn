import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  insertPrintFormQuestions,
  selectPrintFormQuestions,
  updatePrintFormQuestionVariants,
} from '../../models/print-form-question.js';
import {
  archivePrintForm,
  assertSettingsMatchQuestions,
  insertPrintForm,
  lockAssessmentForPrintForms,
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
  selectPrintFormsForAssessment,
  updatePrintFormPaperSize,
} from '../../models/print-form.js';
import { selectAssessmentQuestionIdsForInstance } from '../assessment.js';
import { nextPrintFormLabel, printFormLabelBase } from '../client/printing/print-form-label.js';
import { MAX_ACTIVE_PRINT_FORMS } from '../client/printing/print-form-limits.js';
import {
  type Assessment,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  type Course,
  type CourseInstance,
  type PrintForm,
  type PrintFormQuestion,
  type Question,
  QuestionSchema,
} from '../db-types.js';
import { ensureVariant, getQuestionCourse } from '../question-variant.js';

import type { PaperSize } from './paper-size.js';
import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from './print-settings.js';

const sql = loadSqlEquiv(import.meta.url);

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
  sourcePrintFormId?: string;
  settings?: PrintSettings;
}

async function createPrintVariant({
  assessmentQuestion,
  question,
  course,
  courseInstance,
  userId,
  authnUserId,
}: {
  assessmentQuestion: AssessmentQuestion;
  question: Question;
  course: Course;
  courseInstance: CourseInstance;
  userId: string;
  authnUserId: string;
}) {
  return await ensureVariant({
    question_id: question.id,
    instance_question_id: null,
    user_id: userId,
    authn_user_id: authnUserId,
    course_instance: courseInstance,
    variant_course: course,
    question_course: await getQuestionCourse(question, course),
    options: { preferences: assessmentQuestion.preferences ?? {} },
    require_open: false,
    client_fingerprint_id: null,
  });
}

async function createSavedPrintFormQuestions({
  savedQuestions,
  course,
  courseInstance,
  userId,
  authnUserId,
}: {
  savedQuestions: Awaited<ReturnType<typeof selectPrintFormQuestions>>;
  course: Course;
  courseInstance: CourseInstance;
  userId: string;
  authnUserId: string;
}) {
  const questions: Omit<PrintFormQuestion, 'id' | 'print_form_id'>[] = [];
  for (const { assessment_question, print_form_question, question } of savedQuestions) {
    const variant = await createPrintVariant({
      assessmentQuestion: assessment_question,
      question,
      course,
      courseInstance,
      userId,
      authnUserId,
    });
    questions.push({
      assessment_question_id: print_form_question.assessment_question_id,
      variant_id: variant.id,
      position: print_form_question.position,
      question_number: print_form_question.question_number,
      max_points: print_form_question.max_points,
    });
  }
  return questions;
}

async function copySavedPrintFormQuestions(printFormId: string) {
  const savedQuestions = await selectPrintFormQuestions(printFormId);
  const questions: Omit<PrintFormQuestion, 'id' | 'print_form_id'>[] = [];
  for (const { print_form_question: question } of savedQuestions) {
    const variantId = await queryScalar(
      sql.copy_print_form_variant,
      { variant_id: question.variant_id },
      IdSchema,
    );
    questions.push({
      assessment_question_id: question.assessment_question_id,
      variant_id: variantId,
      position: question.position,
      question_number: question.question_number,
      max_points: question.max_points,
    });
  }
  return questions;
}

function mapQuestionSettingsToNewForm(
  settings: PrintSettings,
  sourceQuestions: Awaited<ReturnType<typeof selectPrintFormQuestions>>,
  newQuestions: Pick<PrintFormQuestion, 'assessment_question_id' | 'question_number'>[],
): PrintSettings {
  const newNumberByQuestionId = new Map(
    newQuestions.map((question) => [question.assessment_question_id, question.question_number]),
  );
  const newNumberByOldNumber = new Map<string, string>();
  for (const { print_form_question: question } of sourceQuestions) {
    const newNumber = newNumberByQuestionId.get(question.assessment_question_id);
    if (newNumber !== undefined) newNumberByOldNumber.set(question.question_number, newNumber);
  }

  return {
    ...settings,
    questionSizes: Object.fromEntries(
      Object.entries(settings.questionSizes).flatMap(([number, size]) => {
        const newNumber = newNumberByOldNumber.get(number);
        return newNumber === undefined ? [] : [[newNumber, size]];
      }),
    ),
    excludedQuestions: [
      ...new Set(
        settings.excludedQuestions.flatMap((number) => {
          const newNumber = newNumberByOldNumber.get(number);
          return newNumber === undefined ? [] : [newNumber];
        }),
      ),
    ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  };
}

/** Creates a form, or rerandomizes an unlocked form in place. */
export async function createPrintForm(options: CreatePrintFormOptions) {
  if (options.replacesPrintFormId) {
    const form = await selectOptionalPrintForm({
      printFormId: options.replacesPrintFormId,
      assessmentId: options.assessment.id,
    });
    if (form?.archived_at !== null) {
      throw new HttpStatusError(404, 'The form to regenerate is no longer active.');
    }
    if (form.question_selection_locked_at === null) {
      return await regenerateUnlockedPrintForm({
        ...options,
        replacesPrintFormId: options.replacesPrintFormId,
      });
    }
  }
  return await createPrintFormInternal({ ...options, ensureInitial: false });
}

async function regenerateUnlockedPrintForm({
  assessment,
  course,
  courseInstance,
  userId,
  authnUserId,
  replacesPrintFormId,
}: CreatePrintFormOptions & { replacesPrintFormId: string }) {
  const savedQuestions = await selectPrintFormQuestions(replacesPrintFormId);
  const questions = await createSavedPrintFormQuestions({
    savedQuestions,
    course,
    courseInstance,
    userId,
    authnUserId,
  });
  const updates = savedQuestions.map(({ print_form_question: saved }, index) => ({
    id: saved.id,
    previous_variant_id: saved.variant_id,
    variant_id: questions[index].variant_id,
  }));

  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessment.id);
    const form = await selectOptionalPrintForm({
      printFormId: replacesPrintFormId,
      assessmentId: assessment.id,
    });
    if (form?.archived_at !== null) {
      throw new HttpStatusError(404, 'The form to regenerate is no longer active.');
    }
    if (form.question_selection_locked_at !== null) {
      throw new HttpStatusError(409, 'This form was exported while regenerating. Try again.');
    }
    const updated = await updatePrintFormQuestionVariants({
      printFormId: replacesPrintFormId,
      updates,
    });
    if (updated.length !== updates.length) {
      throw new HttpStatusError(409, 'This form changed while regenerating. Try again.');
    }
    return form;
  });
}

/** Returns an active form, creating one when no current forms exist. */
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
  sourcePrintFormId,
  settings,
  ensureInitial,
}: CreatePrintFormOptions & { ensureInitial: boolean }) {
  const initialActiveForms = await selectActivePrintFormsForAssessment({
    assessmentId: assessment.id,
  });
  if (ensureInitial && initialActiveForms.length > 0) {
    return (
      initialActiveForms.find((form) => printFormLabelBase(form.label) === 'A') ??
      initialActiveForms[0]
    );
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
    const variant = await createPrintVariant({
      assessmentQuestion: selected.assessment_question,
      question: selected.question,
      course,
      courseInstance,
      userId,
      authnUserId,
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
    if (ensureInitial && activeForms.length > 0) {
      return activeForms.find((form) => printFormLabelBase(form.label) === 'A') ?? activeForms[0];
    }
    assertCanCreatePrintForm(activeForms, replacesPrintFormId);
    const replacedForm = replacesPrintFormId
      ? activeForms.find((form) => form.id === replacesPrintFormId)
      : undefined;
    const label = nextPrintFormLabel(forms, replacedForm?.label);
    const defaultSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      includeHonorCode: !!assessment.require_honor_code,
    };
    const inheritedSettings = replacedForm
      ? { ...replacedForm.settings, questionSizes: {}, excludedQuestions: [] }
      : (settings ?? defaultSettings);
    const sourceForm = sourcePrintFormId
      ? await selectOptionalPrintForm({
          printFormId: sourcePrintFormId,
          assessmentId: assessment.id,
        })
      : null;
    if (sourcePrintFormId && !sourceForm) {
      throw new HttpStatusError(404, 'The form used for the new form is no longer available.');
    }
    const mappedSettings = sourceForm
      ? mapQuestionSettingsToNewForm(
          inheritedSettings,
          await selectPrintFormQuestions(sourceForm.id),
          questions,
        )
      : inheritedSettings;
    const formSettings = {
      ...mappedSettings,
      paperSize: activeForms[0]?.settings.paperSize ?? mappedSettings.paperSize,
    };
    assertSettingsMatchQuestions(
      formSettings,
      questions.map((question) => question.question_number),
    );
    const form = await insertPrintForm({
      assessmentId: assessment.id,
      userId,
      authnUserId,
      label,
      settings: formSettings,
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

/** Archives a form while preserving at least one current form for the assessment. */
export async function archivePrintFormIfOtherActive({
  assessmentId,
  printFormId,
}: {
  assessmentId: string;
  printFormId: string;
}) {
  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessmentId);
    const activeForms = await selectActivePrintFormsForAssessment({ assessmentId });
    if (!activeForms.some((form) => form.id === printFormId)) {
      throw new HttpStatusError(404, 'This print form is no longer active.');
    }
    if (activeForms.length === 1) {
      throw new HttpStatusError(400, 'The only current print form cannot be archived.');
    }
    const archived = await archivePrintForm({ printFormId, assessmentId });
    if (!archived) {
      throw new HttpStatusError(404, 'This print form is no longer active.');
    }
    return archived;
  });
}

interface PaperSizeFormSnapshot {
  id: string;
  paperSize: PaperSize;
  locked: boolean;
}

function assertPaperSizeFormSnapshot(
  activeForms: PrintForm[],
  expectedForms: PaperSizeFormSnapshot[],
) {
  const expectedById = new Map(expectedForms.map((form) => [form.id, form]));
  if (
    expectedById.size !== activeForms.length ||
    expectedForms.length !== activeForms.length ||
    activeForms.some((form) => {
      const expected = expectedById.get(form.id);
      return (
        !expected ||
        expected.paperSize !== form.settings.paperSize ||
        expected.locked !== (form.question_selection_locked_at !== null)
      );
    })
  ) {
    throw new HttpStatusError(409, 'The current forms changed. Reload the page and try again.');
  }
}

/** Applies a shared paper size while retaining downloaded versions of affected forms. */
export async function setPrintFormPaperSize({
  assessment,
  userId,
  authnUserId,
  printFormId,
  paperSize,
  expectedForms,
}: Pick<CreatePrintFormOptions, 'assessment' | 'userId' | 'authnUserId'> & {
  printFormId: string;
  paperSize: PaperSize;
  expectedForms: PaperSizeFormSnapshot[];
}) {
  const initialActiveForms = await selectActivePrintFormsForAssessment({
    assessmentId: assessment.id,
  });
  if (!initialActiveForms.some((form) => form.id === printFormId)) {
    throw new HttpStatusError(404, 'This print form is no longer active.');
  }
  assertPaperSizeFormSnapshot(initialActiveForms, expectedForms);

  const replacementQuestions = new Map<string, Omit<PrintFormQuestion, 'id' | 'print_form_id'>[]>();
  for (const form of initialActiveForms) {
    if (form.settings.paperSize !== paperSize && form.question_selection_locked_at !== null) {
      replacementQuestions.set(form.id, await copySavedPrintFormQuestions(form.id));
    }
  }

  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessment.id);
    const forms = await selectPrintFormsForAssessment({ assessmentId: assessment.id });
    const activeForms = forms.filter((form) => form.archived_at === null);
    if (!activeForms.some((form) => form.id === printFormId)) {
      throw new HttpStatusError(404, 'This print form is no longer active.');
    }
    assertPaperSizeFormSnapshot(activeForms, expectedForms);

    const replacements: {
      oldPrintFormId: string;
      printFormId: string;
      label: string;
      settings: PrintSettings;
    }[] = [];
    for (const form of activeForms) {
      if (form.settings.paperSize === paperSize) continue;
      if (form.question_selection_locked_at === null) {
        const updated = await updatePrintFormPaperSize({
          printFormId: form.id,
          assessmentId: assessment.id,
          paperSize,
        });
        if (!updated) throw new HttpStatusError(404, 'This print form is no longer active.');
        continue;
      }

      const questions = replacementQuestions.get(form.id);
      if (!questions) {
        throw new HttpStatusError(409, 'The current forms changed. Reload the page and try again.');
      }
      const replacement = await insertPrintForm({
        assessmentId: assessment.id,
        userId,
        authnUserId,
        label: nextPrintFormLabel(forms, form.label),
        settings: { ...form.settings, paperSize },
      });
      await insertPrintFormQuestions({ printFormId: replacement.id, questions });
      const archived = await archivePrintForm({
        printFormId: form.id,
        assessmentId: assessment.id,
      });
      if (!archived) throw new HttpStatusError(404, 'This print form is no longer active.');
      forms.push(replacement);
      replacements.push({
        oldPrintFormId: form.id,
        printFormId: replacement.id,
        label: replacement.label,
        settings: replacement.settings,
      });
    }
    return { replacements };
  });
}

/** Creates a new version with one changed selection while keeping the saved form intact. */
export async function revisePrintFormSelection({
  assessment,
  userId,
  authnUserId,
  printFormId,
  questionNumber,
  included,
}: Pick<CreatePrintFormOptions, 'assessment' | 'userId' | 'authnUserId'> & {
  printFormId: string;
  questionNumber: string;
  included: boolean;
}) {
  const original = await selectOptionalPrintForm({ printFormId, assessmentId: assessment.id });
  if (original?.archived_at !== null) {
    throw new HttpStatusError(404, 'This print form is no longer active.');
  }
  if (original.question_selection_locked_at === null) {
    throw new HttpStatusError(409, 'This form’s question selection is still editable.');
  }

  const savedQuestions = await selectPrintFormQuestions(printFormId);
  if (
    !savedQuestions.some(
      ({ print_form_question }) => print_form_question.question_number === questionNumber,
    )
  ) {
    throw new HttpStatusError(400, 'This question is not part of the print form.');
  }

  // The saved question set cannot change after the form has been exported, so copying its
  // variants outside the assessment lock keeps the replacement's random values.
  const questions = await copySavedPrintFormQuestions(printFormId);

  return await runInTransactionAsync(async () => {
    await lockAssessmentForPrintForms(assessment.id);
    const forms = await selectPrintFormsForAssessment({ assessmentId: assessment.id });
    const current = forms.find((form) => form.id === printFormId && form.archived_at === null);
    if (!current) {
      throw new HttpStatusError(404, 'This print form is no longer active.');
    }
    if (current.question_selection_locked_at === null) {
      throw new HttpStatusError(409, 'This form’s question selection is still editable.');
    }
    const currentlyExcluded = current.settings.excludedQuestions.includes(questionNumber);
    if (currentlyExcluded === !included) {
      throw new HttpStatusError(409, 'This question selection has already changed.');
    }

    const excludedQuestions = included
      ? current.settings.excludedQuestions.filter((number) => number !== questionNumber)
      : [...current.settings.excludedQuestions, questionNumber].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        );
    const form = await insertPrintForm({
      assessmentId: assessment.id,
      userId,
      authnUserId,
      label: nextPrintFormLabel(forms, current.label),
      settings: { ...current.settings, excludedQuestions },
    });
    await insertPrintFormQuestions({ printFormId: form.id, questions });
    const archived = await archivePrintForm({ printFormId, assessmentId: assessment.id });
    if (!archived) {
      throw new HttpStatusError(409, 'This print form is no longer active.');
    }
    return form;
  });
}
