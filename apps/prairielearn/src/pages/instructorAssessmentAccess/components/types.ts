import { z } from 'zod';

import type { AccessControlJson } from '../../../schemas/accessControl.js';

export interface AccessControlIndividual {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

export interface AccessControlJsonWithId extends AccessControlJson {
  /** Database ID (undefined for new/unsaved rules) */
  id?: string;
  /** Database rule number for sorting */
  number?: number;
  /** Rule type: 'student_label' for label-based rules, 'enrollment' for individual student rules, 'none' for rules without specific targeting */
  ruleType?: 'student_label' | 'enrollment' | 'none' | null;
  individuals?: AccessControlIndividual[];
}

/** Field names that belong to the date control section of an access control rule. */
export const DATE_CONTROL_FIELD_NAMES = [
  'releaseDate',
  'dueDate',
  'earlyDeadlines',
  'lateDeadlines',
  'afterLastDeadline',
  'durationMinutes',
  'password',
] as const;

export const DeadlineEntrySchema = z.object({
  date: z.string(),
  credit: z.number(),
});

export const AfterLastDeadlineValueSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  credit: z.number().optional(),
});

export const QuestionVisibilityValueSchema = z.object({
  hideQuestions: z.boolean(),
  showAgainDate: z.string().optional(),
  hideAgainDate: z.string().optional(),
});

export const ScoreVisibilityValueSchema = z.object({
  hideScore: z.boolean(),
  showAgainDate: z.string().optional(),
});

const PrairieTestExamSchema = z.object({
  examUuid: z.string(),
  readOnly: z.boolean().optional(),
});

export const IndividualTargetSchema = z.object({
  enrollmentId: z.string().optional(),
  uid: z.string(),
  name: z.string().nullable(),
});

export const StudentLabelTargetSchema = z.object({
  studentLabelId: z.string(),
  name: z.string(),
});

export const AppliesToSchema = z.object({
  targetType: z.enum(['individual', 'student_label']),
  individuals: z.array(IndividualTargetSchema),
  studentLabels: z.array(StudentLabelTargetSchema),
});

// Main rule: flat fields, null = feature off
export const MainRuleSchema = z.object({
  id: z.string().optional(),
  trackingId: z.string(),
  listBeforeRelease: z.boolean(),
  dateControlEnabled: z.boolean(),
  releaseDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  earlyDeadlines: z.array(DeadlineEntrySchema),
  lateDeadlines: z.array(DeadlineEntrySchema),
  afterLastDeadline: AfterLastDeadlineValueSchema.nullable(),
  durationMinutes: z.number().nullable(),
  password: z.string().nullable(),
  prairieTestEnabled: z.boolean(),
  prairieTestExams: z.array(PrairieTestExamSchema),
  questionVisibility: QuestionVisibilityValueSchema,
  scoreVisibility: ScoreVisibilityValueSchema,
});

// Override: flat fields. The `overriddenFields` array tracks which fields
// are overridden vs inherited from the main rule.  We avoid using `undefined`
// as a sentinel because react-hook-form does not support setting field values
// to `undefined` (the value silently reverts).
export const OverrideSchema = z.object({
  id: z.string().optional(),
  trackingId: z.string(),
  appliesTo: AppliesToSchema,
  overriddenFields: z.array(z.string()),
  releaseDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  earlyDeadlines: z.array(DeadlineEntrySchema),
  lateDeadlines: z.array(DeadlineEntrySchema),
  afterLastDeadline: AfterLastDeadlineValueSchema.nullable(),
  durationMinutes: z.number().nullable(),
  password: z.string().nullable(),
  questionVisibility: QuestionVisibilityValueSchema,
  scoreVisibility: ScoreVisibilityValueSchema,
});

export const AccessControlFormDataSchema = z.object({
  mainRule: MainRuleSchema,
  overrides: z.array(OverrideSchema),
});

export type DeadlineEntry = z.infer<typeof DeadlineEntrySchema>;

export type AfterLastDeadlineValue = z.infer<typeof AfterLastDeadlineValueSchema>;

export type QuestionVisibilityValue = z.infer<typeof QuestionVisibilityValueSchema>;

export type ScoreVisibilityValue = z.infer<typeof ScoreVisibilityValueSchema>;

export type TargetType = z.infer<typeof AppliesToSchema>['targetType'];

export type IndividualTarget = z.infer<typeof IndividualTargetSchema>;

export type StudentLabelTarget = z.infer<typeof StudentLabelTargetSchema>;

export type AppliesTo = z.infer<typeof AppliesToSchema>;

export type MainRuleData = z.infer<typeof MainRuleSchema>;

export type OverrideData = z.infer<typeof OverrideSchema>;

export type AccessControlFormData = z.infer<typeof AccessControlFormDataSchema>;

/**
 * Strip the trailing 'Z' from an ISO date string so it is compatible with
 * `<input type="datetime-local">` which expects `yyyy-MM-ddThh:mm[:ss[.SSS]]`.
 */
function toLocalDatetimeValue(value: string): string;
function toLocalDatetimeValue(value: string | null): string | null;
function toLocalDatetimeValue(value: string | undefined): string | undefined;
function toLocalDatetimeValue(value: string | null | undefined): string | null | undefined;

function toLocalDatetimeValue(value: string | null | undefined): string | null | undefined {
  if (typeof value === 'string') {
    return value.replace(/Z$/, '');
  }
  return value;
}

export function jsonToMainRuleFormData(json: AccessControlJsonWithId): MainRuleData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    listBeforeRelease: json.listBeforeRelease ?? false,
    dateControlEnabled: dc?.releaseDate != null,
    releaseDate: toLocalDatetimeValue(dc?.releaseDate) ?? null,
    dueDate: toLocalDatetimeValue(dc?.dueDate) ?? null,
    earlyDeadlines: (dc?.earlyDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date),
    })),
    lateDeadlines: (dc?.lateDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date),
    })),
    afterLastDeadline: dc?.afterLastDeadline ?? null,
    durationMinutes: dc?.durationMinutes ?? null,
    password: dc?.password ?? null,
    prairieTestEnabled: (json.integrations?.prairieTest?.exams?.length ?? 0) > 0,
    prairieTestExams: json.integrations?.prairieTest?.exams ?? [],
    questionVisibility: {
      hideQuestions: ac?.hideQuestions ?? false,
      showAgainDate: toLocalDatetimeValue(ac?.showQuestionsAgainDate),
      hideAgainDate: toLocalDatetimeValue(ac?.hideQuestionsAgainDate),
    },
    scoreVisibility: {
      hideScore: ac?.hideScore ?? false,
      showAgainDate: toLocalDatetimeValue(ac?.showScoreAgainDate),
    },
  };
}

export function jsonToOverrideFormData(json: AccessControlJsonWithId): OverrideData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  let appliesTo: AppliesTo;
  if (json.ruleType === 'enrollment' && json.individuals && json.individuals.length > 0) {
    appliesTo = {
      targetType: 'individual',
      individuals: json.individuals.map((i) => ({
        enrollmentId: i.enrollmentId,
        uid: i.uid,
        name: i.name,
      })),
      studentLabels: [],
    };
  } else {
    appliesTo = {
      targetType: 'student_label',
      individuals: [],
      studentLabels: (json.labels ?? []).map((name: string) => ({ studentLabelId: '', name })),
    };
  }

  const overriddenFields: string[] = [];

  let releaseDate: string | null = null;
  if (dc?.releaseDate !== undefined) {
    releaseDate = toLocalDatetimeValue(dc.releaseDate) ?? null;
    overriddenFields.push('releaseDate');
  }

  let dueDate: string | null = null;
  if (dc?.dueDate !== undefined) {
    dueDate = toLocalDatetimeValue(dc.dueDate) ?? null;
    overriddenFields.push('dueDate');
  }

  let earlyDeadlines: DeadlineEntry[] = [];
  if (dc?.earlyDeadlines !== undefined) {
    earlyDeadlines = (dc.earlyDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date),
    }));
    overriddenFields.push('earlyDeadlines');
  }

  let lateDeadlines: DeadlineEntry[] = [];
  if (dc?.lateDeadlines !== undefined) {
    lateDeadlines = (dc.lateDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date),
    }));
    overriddenFields.push('lateDeadlines');
  }

  let afterLastDeadline: AfterLastDeadlineValue | null = null;
  if (dc?.afterLastDeadline !== undefined) {
    afterLastDeadline = dc.afterLastDeadline;
    overriddenFields.push('afterLastDeadline');
  }

  let durationMinutes: number | null = null;
  if (dc?.durationMinutes !== undefined) {
    durationMinutes = dc.durationMinutes;
    overriddenFields.push('durationMinutes');
  }

  let password: string | null = null;
  if (dc?.password !== undefined) {
    password = dc.password;
    overriddenFields.push('password');
  }

  let questionVisibility: QuestionVisibilityValue = { hideQuestions: false };
  if (ac?.hideQuestions !== undefined) {
    questionVisibility = {
      hideQuestions: ac.hideQuestions,
      showAgainDate: toLocalDatetimeValue(ac.showQuestionsAgainDate),
      hideAgainDate: toLocalDatetimeValue(ac.hideQuestionsAgainDate),
    };
    overriddenFields.push('questionVisibility');
  }

  let scoreVisibility: ScoreVisibilityValue = { hideScore: false };
  if (ac?.hideScore !== undefined) {
    scoreVisibility = {
      hideScore: ac.hideScore,
      showAgainDate: toLocalDatetimeValue(ac.showScoreAgainDate),
    };
    overriddenFields.push('scoreVisibility');
  }

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    appliesTo,
    overriddenFields,
    releaseDate,
    dueDate,
    earlyDeadlines,
    lateDeadlines,
    afterLastDeadline,
    durationMinutes,
    password,
    questionVisibility,
    scoreVisibility,
  };
}

function mainRuleToJson(rule: MainRuleData): AccessControlJsonWithId {
  const output: AccessControlJsonWithId = {
    id: rule.id,
    listBeforeRelease: rule.listBeforeRelease,
  };

  if (rule.dateControlEnabled) {
    output.dateControl = {};
    // "Released immediately" in the UI sets releaseDate to null; persist as
    // the current timestamp so it round-trips as a real date (matching the
    // course-instance publishing pattern).
    output.dateControl.releaseDate = rule.releaseDate || new Date().toISOString();
    if (rule.dueDate) output.dateControl.dueDate = rule.dueDate;
    if (rule.earlyDeadlines.length > 0) output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    if (rule.lateDeadlines.length > 0) output.dateControl.lateDeadlines = rule.lateDeadlines;
    if (rule.afterLastDeadline) output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    if (rule.durationMinutes != null) output.dateControl.durationMinutes = rule.durationMinutes;
    if (rule.password) output.dateControl.password = rule.password;
  }

  if (rule.prairieTestEnabled && rule.prairieTestExams.length > 0) {
    output.integrations = {
      prairieTest: {
        exams: rule.prairieTestExams,
      },
    };
  }

  output.afterComplete = {
    hideQuestions: rule.questionVisibility.hideQuestions,
  };
  if (rule.questionVisibility.showAgainDate) {
    output.afterComplete.showQuestionsAgainDate = rule.questionVisibility.showAgainDate;
  }
  if (rule.questionVisibility.hideAgainDate) {
    output.afterComplete.hideQuestionsAgainDate = rule.questionVisibility.hideAgainDate;
  }
  output.afterComplete.hideScore = rule.scoreVisibility.hideScore;
  if (rule.scoreVisibility.showAgainDate) {
    output.afterComplete.showScoreAgainDate = rule.scoreVisibility.showAgainDate;
  }

  return output;
}

function overrideToJson(rule: OverrideData): AccessControlJsonWithId {
  const labels =
    rule.appliesTo.targetType === 'student_label' && rule.appliesTo.studentLabels.length > 0
      ? rule.appliesTo.studentLabels.map((sl) => sl.name)
      : undefined;

  const output: AccessControlJsonWithId = {
    id: rule.id,
    labels,
  };

  const of = new Set(rule.overriddenFields);

  const hasDateControl = DATE_CONTROL_FIELD_NAMES.some((f) => of.has(f));

  if (hasDateControl) {
    output.dateControl = {};
    if (of.has('releaseDate')) output.dateControl.releaseDate = rule.releaseDate;
    if (of.has('dueDate')) output.dateControl.dueDate = rule.dueDate;
    if (of.has('earlyDeadlines')) output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    if (of.has('lateDeadlines')) output.dateControl.lateDeadlines = rule.lateDeadlines;
    if (of.has('afterLastDeadline')) output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    if (of.has('durationMinutes')) output.dateControl.durationMinutes = rule.durationMinutes;
    if (of.has('password')) output.dateControl.password = rule.password;
  }

  if (of.has('questionVisibility') || of.has('scoreVisibility')) {
    output.afterComplete = {};
    if (of.has('questionVisibility')) {
      output.afterComplete.hideQuestions = rule.questionVisibility.hideQuestions;
      if (rule.questionVisibility.showAgainDate) {
        output.afterComplete.showQuestionsAgainDate = rule.questionVisibility.showAgainDate;
      }
      if (rule.questionVisibility.hideAgainDate) {
        output.afterComplete.hideQuestionsAgainDate = rule.questionVisibility.hideAgainDate;
      }
    }
    if (of.has('scoreVisibility')) {
      output.afterComplete.hideScore = rule.scoreVisibility.hideScore;
      if (rule.scoreVisibility.showAgainDate) {
        output.afterComplete.showScoreAgainDate = rule.scoreVisibility.showAgainDate;
      }
    }
  }

  if (rule.appliesTo.targetType === 'individual') {
    output.ruleType = 'enrollment';
    output.individuals = rule.appliesTo.individuals.map((ind) => ({
      enrollmentId: ind.enrollmentId ?? '',
      uid: ind.uid,
      name: ind.name,
    }));
  }

  return output;
}

export function formDataToJson(formData: AccessControlFormData): AccessControlJsonWithId[] {
  return [mainRuleToJson(formData.mainRule), ...formData.overrides.map(overrideToJson)];
}

export function createDefaultOverrideFormData(): OverrideData {
  return {
    trackingId: crypto.randomUUID(),
    appliesTo: {
      targetType: 'individual',
      individuals: [],
      studentLabels: [],
    },
    overriddenFields: [],
    releaseDate: null,
    dueDate: null,
    earlyDeadlines: [],
    lateDeadlines: [],
    afterLastDeadline: null,
    durationMinutes: null,
    password: null,
    questionVisibility: { hideQuestions: false },
    scoreVisibility: { hideScore: false },
  };
}
