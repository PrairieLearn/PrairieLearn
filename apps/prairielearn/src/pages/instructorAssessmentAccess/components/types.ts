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

export interface DeadlineEntry {
  date: string;
  credit: number;
}

export interface AfterLastDeadlineValue {
  allowSubmissions?: boolean;
  credit?: number;
}

export interface QuestionVisibilityValue {
  hideQuestions: boolean;
  showAgainDate?: string;
  hideAgainDate?: string;
}

export interface ScoreVisibilityValue {
  hideScore: boolean;
  showAgainDate?: string;
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
  releaseDate: string;
  dueDate: string | null;
  earlyDeadlines: DeadlineEntry[];
  lateDeadlines: DeadlineEntry[];
  afterLastDeadline: AfterLastDeadlineValue | null;
  durationMinutes: number | null;
  password: string | null;
  prairieTestEnabled: boolean;
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
  overriddenFields: string[];
  releaseDate: string | null;
  dueDate: string | null;
  earlyDeadlines: DeadlineEntry[];
  lateDeadlines: DeadlineEntry[];
  afterLastDeadline: AfterLastDeadlineValue | null;
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
      (dc?.lateDeadlines?.length ?? 0) > 0,
    releaseDate: toLocalDatetimeValue(dc?.releaseDate, displayTimezone) ?? '',
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
    prairieTestEnabled: (json.integrations?.prairieTest?.exams?.length ?? 0) > 0,
    prairieTestExams: json.integrations?.prairieTest?.exams ?? [],
    questionVisibility: {
      hideQuestions: ac?.hideQuestions ?? true,
      showAgainDate: toLocalDatetimeValue(ac?.showQuestionsAgainDate, displayTimezone) ?? undefined,
      hideAgainDate: toLocalDatetimeValue(ac?.hideQuestionsAgainDate, displayTimezone) ?? undefined,
    },
    scoreVisibility: {
      hideScore: ac?.hideScore ?? false,
      showAgainDate: toLocalDatetimeValue(ac?.showScoreAgainDate, displayTimezone) ?? undefined,
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

  const overriddenFields: string[] = [];

  let releaseDate: string | null = null;
  if (dc?.releaseDate !== undefined) {
    releaseDate = toLocalDatetimeValue(dc.releaseDate, displayTimezone) ?? null;
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

  let questionVisibility: QuestionVisibilityValue = { hideQuestions: true };
  if (ac?.hideQuestions !== undefined) {
    questionVisibility = {
      hideQuestions: ac.hideQuestions,
      showAgainDate: toLocalDatetimeValue(ac.showQuestionsAgainDate, displayTimezone) ?? undefined,
      hideAgainDate: toLocalDatetimeValue(ac.hideQuestionsAgainDate, displayTimezone) ?? undefined,
    };
    overriddenFields.push('questionVisibility');
  }

  let scoreVisibility: ScoreVisibilityValue = { hideScore: false };
  if (ac?.hideScore !== undefined) {
    scoreVisibility = {
      hideScore: ac.hideScore,
      showAgainDate: toLocalDatetimeValue(ac.showScoreAgainDate, displayTimezone) ?? undefined,
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
  }

  // Non-date fields live under dateControl in the schema but should be
  // preserved regardless of whether the date control toggle is enabled.
  if (rule.afterLastDeadline || rule.durationMinutes != null || rule.password) {
    output.dateControl ??= {};
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

  // Only write afterComplete when values differ from defaults
  // (hideQuestions: true, hideScore: false).
  const qv = rule.questionVisibility;
  const sv = rule.scoreVisibility;
  const hasNonDefaultAfterComplete =
    !qv.hideQuestions || qv.showAgainDate || qv.hideAgainDate || sv.hideScore || sv.showAgainDate;

  if (hasNonDefaultAfterComplete) {
    output.afterComplete = {
      hideQuestions: qv.hideQuestions,
    };
    if (qv.showAgainDate) {
      output.afterComplete.showQuestionsAgainDate = qv.showAgainDate;
    }
    if (qv.hideAgainDate) {
      output.afterComplete.hideQuestionsAgainDate = qv.hideAgainDate;
    }
    output.afterComplete.hideScore = sv.hideScore;
    if (sv.showAgainDate) {
      output.afterComplete.showScoreAgainDate = sv.showAgainDate;
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

  if (rule.appliesTo.targetType === 'enrollment') {
    output.ruleType = 'enrollment';
    output.enrollments = rule.appliesTo.enrollments;
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
      targetType: 'enrollment',
      enrollments: [],
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
    questionVisibility: { hideQuestions: true },
    scoreVisibility: { hideScore: false },
  };
}
