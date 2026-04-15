import { Temporal } from '@js-temporal/polyfill';

import type { AccessControlJsonWithId } from '../../../models/assessment-access-control-rules.js';

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

export type OverridableFieldName =
  | (typeof DATE_CONTROL_FIELD_NAMES)[number]
  | 'questionVisibility'
  | 'scoreVisibility';

export interface DeadlineEntry {
  date: string;
  credit: number;
}

export interface AfterLastDeadlineValue {
  allowSubmissions: boolean;
  credit?: number;
}

export interface QuestionVisibilityValue {
  hidden: boolean;
  visibleFromDate?: string;
  visibleUntilDate?: string;
}

export interface ScoreVisibilityValue {
  hidden: boolean;
  visibleFromDate?: string;
}

export function isNonDefaultQuestionVisibility(qv: QuestionVisibilityValue): boolean {
  return !qv.hidden || qv.visibleFromDate !== undefined || qv.visibleUntilDate !== undefined;
}

export function isNonDefaultScoreVisibility(sv: ScoreVisibilityValue): boolean {
  return sv.hidden;
}

interface PrairieTestExam {
  examUuid: string;
  readOnly?: boolean;
}

export interface EnrollmentTarget {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

export interface StudentLabelTarget {
  studentLabelId: string;
  name: string;
  color?: string;
}

export type TargetType = 'enrollment' | 'student_label';

export interface AppliesTo {
  targetType: TargetType;
  enrollments: EnrollmentTarget[];
  studentLabels: StudentLabelTarget[];
}

// Main rule: flat fields, null = feature off
export interface MainRuleData {
  id?: string;
  trackingId: string;
  listBeforeRelease: boolean;
  dateControlEnabled: boolean;
  releaseDate: string | null;
  dueDate: string | null;
  earlyDeadlines: DeadlineEntry[];
  lateDeadlines: DeadlineEntry[];
  afterLastDeadline: AfterLastDeadlineValue | null;
  durationMinutes: number | null;
  password: string | null;
  prairieTestExams: PrairieTestExam[];
  questionVisibility: QuestionVisibilityValue;
  scoreVisibility: ScoreVisibilityValue;
}

// Override: flat fields. The `overriddenFields` array tracks which fields
// are overridden vs inherited from the main rule.  We avoid using `undefined`
// as a sentinel because react-hook-form does not support setting field values
// to `undefined` (the value silently reverts).
export interface OverrideData {
  id?: string;
  trackingId: string;
  appliesTo: AppliesTo;
  overriddenFields: OverridableFieldName[];
  releaseDate: string | null;
  dueDate: string | null;
  earlyDeadlines: DeadlineEntry[];
  lateDeadlines: DeadlineEntry[];
  afterLastDeadline: AfterLastDeadlineValue;
  durationMinutes: number | null;
  password: string | null;
  questionVisibility: QuestionVisibilityValue;
  scoreVisibility: ScoreVisibilityValue;
}

export interface AccessControlFormData {
  mainRule: MainRuleData;
  overrides: OverrideData[];
}

/**
 * Convert a date string to a timezone-naive datetime-local value suitable for
 * `<input type="datetime-local">` (format: `yyyy-MM-ddTHH:mm:ss`).
 *
 * Parses the ISO 8601 string as a UTC instant, then converts it to the course
 * instance's display timezone. Null/undefined values pass through unchanged.
 */
function toLocalDatetimeValue<T extends string | null | undefined>(
  value: T,
  displayTimezone: string,
): T {
  if (typeof value === 'string') {
    return Temporal.Instant.from(value)
      .toZonedDateTimeISO(displayTimezone)
      .toPlainDateTime()
      .toString({ smallestUnit: 'second' }) as T;
  }
  return value;
}

export function jsonToMainRuleFormData(
  json: AccessControlJsonWithId,
  displayTimezone: string,
): MainRuleData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    listBeforeRelease: json.listBeforeRelease ?? false,
    dateControlEnabled:
      dc?.releaseDate != null ||
      dc?.dueDate != null ||
      (dc?.earlyDeadlines?.length ?? 0) > 0 ||
      (dc?.lateDeadlines?.length ?? 0) > 0 ||
      dc?.afterLastDeadline != null ||
      dc?.durationMinutes != null ||
      dc?.password != null,
    releaseDate: toLocalDatetimeValue(dc?.releaseDate, displayTimezone) ?? null,
    dueDate: toLocalDatetimeValue(dc?.dueDate, displayTimezone) ?? null,
    earlyDeadlines: (dc?.earlyDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date, displayTimezone),
    })),
    lateDeadlines: (dc?.lateDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date, displayTimezone),
    })),
    afterLastDeadline: dc?.afterLastDeadline ?? null,
    durationMinutes: dc?.durationMinutes ?? null,
    password: dc?.password ?? null,
    prairieTestExams: json.integrations?.prairieTest?.exams ?? [],
    questionVisibility: {
      hidden: ac?.questions?.hidden ?? true,
      visibleFromDate:
        toLocalDatetimeValue(ac?.questions?.visibleFromDate, displayTimezone) ?? undefined,
      visibleUntilDate:
        toLocalDatetimeValue(ac?.questions?.visibleUntilDate, displayTimezone) ?? undefined,
    },
    scoreVisibility: {
      hidden: ac?.score?.hidden ?? false,
      visibleFromDate:
        toLocalDatetimeValue(ac?.score?.visibleFromDate, displayTimezone) ?? undefined,
    },
  };
}

export function jsonToOverrideFormData(
  json: AccessControlJsonWithId,
  displayTimezone: string,
): OverrideData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  let appliesTo: AppliesTo;
  if (json.ruleType === 'enrollment' && json.enrollments && json.enrollments.length > 0) {
    appliesTo = {
      targetType: 'enrollment',
      enrollments: json.enrollments.map((i) => ({
        enrollmentId: i.enrollmentId,
        uid: i.uid,
        name: i.name,
      })),
      studentLabels: [],
    };
  } else {
    appliesTo = {
      targetType: 'student_label',
      enrollments: [],
      studentLabels: json.labelDetails
        ? json.labelDetails.map((l) => ({ studentLabelId: l.id, name: l.name, color: l.color }))
        : (json.labels ?? []).map((name: string) => ({ studentLabelId: '', name })),
    };
  }

  const overriddenFields: OverridableFieldName[] = [];

  let releaseDate: string | null = null;
  if (dc?.releaseDate !== undefined) {
    releaseDate = toLocalDatetimeValue(dc.releaseDate, displayTimezone);
    overriddenFields.push('releaseDate');
  }

  let dueDate: string | null = null;
  if (dc?.dueDate !== undefined) {
    dueDate = toLocalDatetimeValue(dc.dueDate, displayTimezone) ?? null;
    overriddenFields.push('dueDate');
  }

  let earlyDeadlines: DeadlineEntry[] = [];
  if (dc?.earlyDeadlines !== undefined) {
    earlyDeadlines = (dc.earlyDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date, displayTimezone),
    }));
    overriddenFields.push('earlyDeadlines');
  }

  let lateDeadlines: DeadlineEntry[] = [];
  if (dc?.lateDeadlines !== undefined) {
    lateDeadlines = (dc.lateDeadlines ?? []).map((d) => ({
      ...d,
      date: toLocalDatetimeValue(d.date, displayTimezone),
    }));
    overriddenFields.push('lateDeadlines');
  }

  let afterLastDeadline: AfterLastDeadlineValue = { allowSubmissions: false };
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

  let questionVisibility: QuestionVisibilityValue = { hidden: true };
  if (ac?.questions?.hidden !== undefined) {
    const q = ac.questions;
    questionVisibility = {
      hidden: q.hidden,
      visibleFromDate: toLocalDatetimeValue(q.visibleFromDate, displayTimezone) ?? undefined,
      visibleUntilDate: toLocalDatetimeValue(q.visibleUntilDate, displayTimezone) ?? undefined,
    };
    overriddenFields.push('questionVisibility');
  }

  let scoreVisibility: ScoreVisibilityValue = { hidden: false };
  if (ac?.score?.hidden !== undefined) {
    scoreVisibility = {
      hidden: ac.score.hidden,
      visibleFromDate: toLocalDatetimeValue(ac.score.visibleFromDate, displayTimezone) ?? undefined,
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
  };

  if (rule.listBeforeRelease) {
    output.listBeforeRelease = true;
  }

  if (rule.dateControlEnabled) {
    output.dateControl = {};
    if (rule.releaseDate) output.dateControl.releaseDate = rule.releaseDate;
    if (rule.dueDate) output.dateControl.dueDate = rule.dueDate;
    if (rule.earlyDeadlines.length > 0) output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    if (rule.lateDeadlines.length > 0) output.dateControl.lateDeadlines = rule.lateDeadlines;
    if (rule.afterLastDeadline) {
      output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    }
    if (rule.durationMinutes != null) output.dateControl.durationMinutes = rule.durationMinutes;
    if (rule.password) output.dateControl.password = rule.password;
  }

  if (rule.prairieTestExams.length > 0) {
    output.integrations = {
      prairieTest: {
        exams: rule.prairieTestExams,
      },
    };
  }

  // Only write afterComplete when values differ from defaults
  // (questions.hidden: true, score.hidden: false).
  const qv = rule.questionVisibility;
  const sv = rule.scoreVisibility;
  const hasNonDefaultQuestions = isNonDefaultQuestionVisibility(qv);
  const hasNonDefaultScore = isNonDefaultScoreVisibility(sv);

  if (hasNonDefaultQuestions || hasNonDefaultScore) {
    output.afterComplete = {};
    if (hasNonDefaultQuestions) {
      output.afterComplete.questions = qv.hidden
        ? {
            hidden: true,
            ...(qv.visibleFromDate && { visibleFromDate: qv.visibleFromDate }),
            ...(qv.visibleUntilDate && { visibleUntilDate: qv.visibleUntilDate }),
          }
        : { hidden: false };
    }
    if (hasNonDefaultScore) {
      output.afterComplete.score = sv.hidden
        ? {
            hidden: true,
            ...(sv.visibleFromDate && { visibleFromDate: sv.visibleFromDate }),
          }
        : { hidden: false };
    }
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
    if (of.has('releaseDate') && rule.releaseDate) {
      output.dateControl.releaseDate = rule.releaseDate;
    }
    if (of.has('dueDate')) output.dateControl.dueDate = rule.dueDate;
    if (of.has('earlyDeadlines')) output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    if (of.has('lateDeadlines')) output.dateControl.lateDeadlines = rule.lateDeadlines;
    if (of.has('afterLastDeadline')) {
      output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    }
    if (of.has('durationMinutes')) output.dateControl.durationMinutes = rule.durationMinutes;
    if (of.has('password')) output.dateControl.password = rule.password;
  }

  if (of.has('questionVisibility') || of.has('scoreVisibility')) {
    output.afterComplete = {};
    if (of.has('questionVisibility')) {
      const qv = rule.questionVisibility;
      output.afterComplete.questions = qv.hidden
        ? {
            hidden: true,
            ...(qv.visibleFromDate && { visibleFromDate: qv.visibleFromDate }),
            ...(qv.visibleUntilDate && { visibleUntilDate: qv.visibleUntilDate }),
          }
        : { hidden: false };
    }
    if (of.has('scoreVisibility')) {
      const sv = rule.scoreVisibility;
      output.afterComplete.score = sv.hidden
        ? {
            hidden: true,
            ...(sv.visibleFromDate && { visibleFromDate: sv.visibleFromDate }),
          }
        : { hidden: false };
    }
  }

  if (rule.appliesTo.targetType === 'enrollment') {
    output.ruleType = 'enrollment';
    output.enrollments = rule.appliesTo.enrollments;
  }

  return output;
}

export function formDataToJson(formData: AccessControlFormData): AccessControlJsonWithId[] {
  return [mainRuleToJson(formData.mainRule), ...formData.overrides.map(overrideToJson)];
}

export function createDefaultOverrideFormData(mainRule?: MainRuleData): OverrideData {
  return {
    trackingId: crypto.randomUUID(),
    appliesTo: {
      targetType: 'enrollment',
      enrollments: [],
      studentLabels: [],
    },
    overriddenFields: [],
    releaseDate: mainRule?.releaseDate ?? null,
    dueDate: mainRule?.dueDate ?? null,
    earlyDeadlines: (mainRule?.earlyDeadlines ?? []).map((d) => ({ ...d })),
    lateDeadlines: (mainRule?.lateDeadlines ?? []).map((d) => ({ ...d })),
    afterLastDeadline: mainRule?.afterLastDeadline
      ? { ...mainRule.afterLastDeadline }
      : { allowSubmissions: false },
    durationMinutes: mainRule?.durationMinutes ?? null,
    password: mainRule?.password ?? null,
    questionVisibility: mainRule ? { ...mainRule.questionVisibility } : { hidden: true },
    scoreVisibility: mainRule ? { ...mainRule.scoreVisibility } : { hidden: false },
  };
}
