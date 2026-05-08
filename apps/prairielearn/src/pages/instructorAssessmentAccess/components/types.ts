import { Temporal } from '@js-temporal/polyfill';

import type { AccessControlJsonWithId } from '../../../models/assessment-access-control-rules.js';

/** Field names that belong to the date control section of an access control rule. */
const DATE_CONTROL_FIELD_NAMES = [
  'release',
  'due',
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

/**
 * Form-state representation of the due-date configuration. `date = null`
 * means "no due date". `customCredit = false` means "use default 100% credit"
 * (and `credit` is ignored); `customCredit = true` means "use the value in
 * `credit`" — `credit` may be `null` transiently while the user is editing,
 * which is a validation error.
 *
 * We use `null` (not `undefined`) because react-hook-form silently reverts
 * undefined values to their previous state.
 */
export interface DueValue {
  date: string | null;
  credit: number | null;
  customCredit: boolean;
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
  afterCompleteQuestionsHidden: boolean;
  afterCompleteScoreHidden: boolean;
}

export interface EnrollmentTarget {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

interface StudentLabelTarget {
  studentLabelId: string;
  name: string;
  color?: string;
}

export type TargetType = 'enrollment' | 'student_label';

interface AppliesTo {
  targetType: TargetType;
  enrollments: EnrollmentTarget[];
  studentLabels: StudentLabelTarget[];
}

/**
 * Form-state representation of the release configuration. `date` is the
 * release date itself; `released` is a UI-only flag that backs the
 * "Released" / "Scheduled for release" radio choice. We track it separately
 * from `date` so the user can express a state that is inconsistent with the
 * date (e.g., "Released" with a future date) and see a validation error,
 * which would not otherwise be possible if `released` were derived from
 * `date <= now`. The flag is dropped on JSON serialization.
 */
interface ReleaseValue {
  date: string | null;
  released: boolean;
}

// Default rule: flat fields, null = feature off
export interface DefaultRuleData {
  id?: string;
  trackingId: string;
  beforeReleaseListed: boolean;
  dateControlEnabled: boolean;
  release: ReleaseValue;
  due: DueValue;
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
// are overridden vs inherited from the default rule.  We avoid using `undefined`
// as a sentinel because react-hook-form does not support setting field values
// to `undefined` (the value silently reverts).
export interface OverrideData {
  id?: string;
  trackingId: string;
  appliesTo: AppliesTo;
  overriddenFields: OverridableFieldName[];
  release: ReleaseValue;
  due: DueValue;
  earlyDeadlines: DeadlineEntry[];
  lateDeadlines: DeadlineEntry[];
  afterLastDeadline: AfterLastDeadlineValue | null;
  durationMinutes: number | null;
  password: string | null;
  questionVisibility: QuestionVisibilityValue;
  scoreVisibility: ScoreVisibilityValue;
}

export interface AccessControlFormData {
  defaultRule: DefaultRuleData;
  overrides: OverrideData[];
}

/**
 * The default rule has a completion mechanism when something can actually
 * close the assessment: a due date, a late deadline, a duration limit, or a
 * PrairieTest exam. `dateControlEnabled` alone is not sufficient — a rule
 * with only a release date or password has date control "on" but nothing to
 * trigger completion. Mirrors the server-side `getCompletionMechanismTypes`
 * in `validation.ts`. Used to gate after-complete UI and serialization on
 * the default rule.
 */
export function defaultRuleHasCompletionMechanism(
  rule: Pick<
    DefaultRuleData,
    'dateControlEnabled' | 'due' | 'lateDeadlines' | 'durationMinutes' | 'prairieTestExams'
  >,
): boolean {
  const hasDateControlMechanism =
    rule.dateControlEnabled &&
    (rule.due.date !== null || rule.lateDeadlines.length > 0 || rule.durationMinutes !== null);
  return hasDateControlMechanism || rule.prairieTestExams.length > 0;
}

/**
 * Whether a (timezone-naive) datetime string is at or before "now" in the
 * given display timezone. A null/empty value is treated as released.
 */
export function isReleasedNow(value: string | null, displayTimezone: string): boolean {
  if (!value) return true;
  const release = Temporal.PlainDateTime.from(value);
  const now = Temporal.Now.plainDateTimeISO(displayTimezone);
  return Temporal.PlainDateTime.compare(release, now) <= 0;
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

export function jsonToDefaultRuleFormData(
  json: AccessControlJsonWithId,
  displayTimezone: string,
): DefaultRuleData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  const releaseDate = toLocalDatetimeValue(dc?.release?.date, displayTimezone) ?? null;

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    beforeReleaseListed: json.beforeRelease?.listed ?? false,
    dateControlEnabled:
      dc?.release != null ||
      dc?.due != null ||
      (dc?.earlyDeadlines?.length ?? 0) > 0 ||
      (dc?.lateDeadlines?.length ?? 0) > 0 ||
      dc?.afterLastDeadline != null ||
      dc?.durationMinutes != null ||
      dc?.password != null,
    release: { date: releaseDate, released: isReleasedNow(releaseDate, displayTimezone) },
    due: {
      date: toLocalDatetimeValue(dc?.due?.date ?? null, displayTimezone),
      credit: dc?.due?.credit ?? null,
      customCredit: dc?.due?.credit != null,
    },
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
    prairieTestExams: (json.integrations?.prairieTest?.exams ?? []).map((e) => ({
      examUuid: e.examUuid,
      readOnly: e.readOnly,
      afterCompleteQuestionsHidden: e.afterComplete?.questions?.hidden ?? false,
      afterCompleteScoreHidden: e.afterComplete?.score?.hidden ?? false,
    })),
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

  let release: ReleaseValue = { date: null, released: true };
  if (dc?.release !== undefined) {
    const date = toLocalDatetimeValue(dc.release.date, displayTimezone);
    release = { date, released: isReleasedNow(date, displayTimezone) };
    overriddenFields.push('release');
  }

  let due: DueValue = { date: null, credit: null, customCredit: false };
  if (dc?.due !== undefined) {
    due = {
      date: toLocalDatetimeValue(dc.due.date, displayTimezone),
      credit: dc.due.credit ?? null,
      customCredit: dc.due.credit != null,
    };
    overriddenFields.push('due');
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
    release,
    due,
    earlyDeadlines,
    lateDeadlines,
    afterLastDeadline,
    durationMinutes,
    password,
    questionVisibility,
    scoreVisibility,
  };
}

/**
 * Build the JSON `due` object from form state. `customCredit = false` means
 * "use default" and credit is dropped from JSON; otherwise the explicit
 * number (including 100) is preserved — an explicit 100 is semantically
 * distinct from default because cross-rule validation (e.g. forbidding early
 * deadlines) treats any set credit as customized.
 *
 * `customCredit: true` with `credit: null` is a transient editing state (the
 * user has cleared the input). The field-level validator surfaces "Credit is
 * required" and blocks submit; here we just omit `credit` so that live
 * cross-field validation can keep running without throwing.
 */
function buildDueJson(due: DueValue): { date: string | null; credit?: number } {
  if (due.customCredit && due.credit !== null) {
    return { date: due.date, credit: due.credit };
  }
  return { date: due.date };
}

function defaultRuleToJson(rule: DefaultRuleData): AccessControlJsonWithId {
  const output: AccessControlJsonWithId = {
    id: rule.id,
  };

  if (rule.beforeReleaseListed) {
    output.beforeRelease = { listed: true };
  }

  if (rule.dateControlEnabled) {
    output.dateControl = {};
    if (rule.release.date) output.dateControl.release = { date: rule.release.date };
    // Omit `due` on the default rule when no date is set and no custom credit is
    // applied — it would just emit `{ date: null }`, which is semantically
    // equivalent to "no due configured".
    if (rule.due.date !== null || rule.due.customCredit) {
      output.dateControl.due = buildDueJson(rule.due);
    }
    if (rule.earlyDeadlines.length > 0) {
      output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    }
    if (rule.lateDeadlines.length > 0) {
      output.dateControl.lateDeadlines = rule.lateDeadlines;
    }
    if (rule.afterLastDeadline) {
      output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    }
    if (rule.durationMinutes != null) output.dateControl.durationMinutes = rule.durationMinutes;
    if (rule.password) output.dateControl.password = rule.password;
  }

  if (rule.prairieTestExams.length > 0) {
    output.integrations = {
      prairieTest: {
        exams: rule.prairieTestExams.map((e) => {
          const afterComplete: { questions?: { hidden: true }; score?: { hidden: true } } = {};
          if (e.afterCompleteQuestionsHidden) {
            afterComplete.questions = { hidden: true };
          }
          if (e.afterCompleteScoreHidden) {
            afterComplete.score = { hidden: true };
          }
          return {
            examUuid: e.examUuid,
            ...(e.readOnly && { readOnly: true }),
            ...(Object.keys(afterComplete).length > 0 && { afterComplete }),
          };
        }),
      },
    };
  }

  // Only write afterComplete when values differ from defaults
  // (questions.hidden: true, score.hidden: false) AND there is a
  // completion mechanism (dateControl or PrairieTest). Without one,
  // after-complete settings are meaningless and would fail validation.
  const hasCompletionMechanism = defaultRuleHasCompletionMechanism(rule);
  const qv = rule.questionVisibility;
  const sv = rule.scoreVisibility;
  const hasNonDefaultQuestions = isNonDefaultQuestionVisibility(qv);
  const hasNonDefaultScore = isNonDefaultScoreVisibility(sv);

  if (hasCompletionMechanism && (hasNonDefaultQuestions || hasNonDefaultScore)) {
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
  // Override rules always emit a `labels` array (possibly empty); only default
  // rules omit the key. An empty array means the rule targets zero students
  // (e.g. every label it used to reference was deleted) and is still a
  // student-label rule, not a second default.
  const labels =
    rule.appliesTo.targetType === 'student_label'
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
    if (of.has('release') && rule.release.date) {
      output.dateControl.release = { date: rule.release.date };
    }
    if (of.has('due')) {
      output.dateControl.due = buildDueJson(rule.due);
    }
    if (of.has('earlyDeadlines')) {
      output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    }
    if (of.has('lateDeadlines')) {
      output.dateControl.lateDeadlines = rule.lateDeadlines;
    }
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
  return [
    defaultRuleToJson(formData.defaultRule),
    ...formData.overrides.map((o) => overrideToJson(o)),
  ];
}

export function createDefaultOverrideFormData(defaultRule?: DefaultRuleData): OverrideData {
  return {
    trackingId: crypto.randomUUID(),
    appliesTo: {
      targetType: 'enrollment',
      enrollments: [],
      studentLabels: [],
    },
    overriddenFields: [],
    release: {
      date: defaultRule?.release.date ?? null,
      released: defaultRule?.release.released ?? true,
    },
    due: defaultRule?.due
      ? { ...defaultRule.due }
      : { date: null, credit: null, customCredit: false },
    earlyDeadlines: (defaultRule?.earlyDeadlines ?? []).map((d) => ({ ...d })),
    lateDeadlines: (defaultRule?.lateDeadlines ?? []).map((d) => ({ ...d })),
    afterLastDeadline: defaultRule?.afterLastDeadline ? { ...defaultRule.afterLastDeadline } : null,
    durationMinutes: defaultRule?.durationMinutes ?? null,
    password: defaultRule?.password ?? null,
    questionVisibility: defaultRule ? { ...defaultRule.questionVisibility } : { hidden: true },
    scoreVisibility: defaultRule ? { ...defaultRule.scoreVisibility } : { hidden: false },
  };
}
