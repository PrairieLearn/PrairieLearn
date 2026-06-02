import type { EnumCourseInstanceRole, EnumCourseRole, EnumMode } from '../db-types.js';

import {
  type AccessTimelineEntry,
  type RuntimeDateControl,
  buildAccessTimeline,
} from './timeline.js';

export interface RuntimeAfterComplete {
  questions?: {
    hidden?: boolean;
    visibleFromDate?: Date | null;
    visibleUntilDate?: Date | null;
  };
  score?: {
    hidden?: boolean;
    visibleFromDate?: Date | null;
  };
}

export interface PrairieTestExam {
  uuid: string;
  readOnly: boolean;
  questionsHidden: boolean;
  scoreHidden: boolean;
}

/**
 * Fields that override-targeted rules can set. Mirrors the JSON shape with
 * dates parsed to `Date`. `DefaultRuleBody` extends this with default-rule-only
 * fields, so an override can't statically declare flags the resolver only
 * honors on the default rule.
 */
interface OverrideRuleBody {
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
}

export interface DefaultRuleBody extends OverrideRuleBody {
  beforeRelease?: { listed?: boolean };
  prairieTestExams: PrairieTestExam[];
}

/**
 * The default rule (`'none'`, always `number: 0`) carries the full rule body.
 */
export interface DefaultRule {
  targetType: 'none';
  number: 0;
  rule: DefaultRuleBody;
}

/**
 * Override variants carry the narrower `OverrideRuleBody` plus their targeting ids.
 */
export type OverrideRule =
  | {
      targetType: 'enrollment';
      number: number;
      rule: OverrideRuleBody;
      enrollmentIds: string[];
    }
  | {
      targetType: 'student_label';
      number: number;
      rule: OverrideRuleBody;
      studentLabelIds: string[];
    };

export type AccessControlRuleInput = DefaultRule | OverrideRule;

export interface EnrollmentContext {
  enrollmentId: string;
  studentLabelIds: string[];
}

export interface PrairieTestReservation {
  examUuid: string;
  accessEnd: Date;
}

export interface AccessControlResolverInput {
  rules: AccessControlRuleInput[];
  enrollment: EnrollmentContext | null;
  date: Date;
  displayTimezone: string;
  authzMode: EnumMode;
  courseRole: EnumCourseRole;
  courseInstanceRole: EnumCourseInstanceRole;
  prairieTestReservations: PrairieTestReservation[];
}

export interface AccessControlResolverResult {
  /** Whether the student is authorized to access the assessment. */
  authorized: boolean;
  credit: number | null;
  creditDateString: string | null;
  timeLimitMin: number | null;
  password: string | null;
  /**
   * Whether the student can currently submit work.
   * `authorized: true, submittable: false` is the review-only state.
   * Translates to the legacy `authz_result.active` field.
   */
  submittable: boolean;
  /**
   * Effective visibility for this assessment-level result. Instance-specific
   * completion may replace this before converting to assessment-instance authz.
   */
  visibility: Visibility;
  /**
   * Top-level after-complete visibility policy, evaluated against the current
   * date. This is applied only once the assessment is complete.
   */
  afterCompleteVisibility: Visibility;
  /**
   * Explains which policy produced the effective `visibility`.
   */
  visibilitySource: 'default' | 'afterComplete' | 'prairieTest';
  /**
   * True when the assessment has reached a "complete" phase from the
   * resolver's perspective: a non-submittable after-last-deadline segment
   * under date control, or a read-only PrairieTest reservation. Instance-
   * specific completion (closed instance or expired time limit) is applied
   * separately in the modern authz layer.
   */
  complete: boolean;
  /**
   * When the assessment is gated behind a PrairieTest reservation, this is
   * the reservation's `accessEnd` timestamp. Used to determine whether the
   * student is still in an active exam session (i.e. mode should be 'Exam').
   */
  examAccessEnd: Date | null;
  /**
   * Resolved visibility flag: true when the assessment should be listed as
   * "coming soon" but not accessible. This happens when `beforeRelease.listed`
   * is set on the rule AND either the current date is before the release date
   * or there is no release date configured. The second case is intentional —
   * an instructor can set `beforeRelease.listed: true` without any dateControl
   * to list every assessment a student will take over the term, perpetually
   * "coming soon" until the instructor later adds dates.
   */
  showBeforeRelease: boolean;
  /**
   * Timeline of credit segments for display. Raw data — formatting is a UI concern.
   */
  accessTimeline: readonly Readonly<AccessTimelineEntry>[];
  /**
   * The next date when the assessment becomes active (e.g. the release date
   * when before release). Null when already active or no future open date.
   */
  nextActiveDate: Date | null;
}

interface Visibility {
  showQuestions: boolean;
  showScore: boolean;
}

const VISIBLE = Object.freeze({
  showQuestions: true,
  showScore: true,
} satisfies Readonly<Visibility>);

const HIDDEN = Object.freeze({
  showQuestions: false,
  showScore: false,
} satisfies Readonly<Visibility>);

const EMPTY_ACCESS_TIMELINE: readonly Readonly<AccessTimelineEntry>[] = Object.freeze([]);

const UNAUTHORIZED_RESULT = Object.freeze({
  authorized: false,
  credit: 0,
  creditDateString: 'None',
  timeLimitMin: null,
  password: null,
  submittable: false,
  visibility: VISIBLE,
  afterCompleteVisibility: VISIBLE,
  visibilitySource: 'default',
  complete: false,
  examAccessEnd: null,
  showBeforeRelease: false,
  accessTimeline: EMPTY_ACCESS_TIMELINE,
  nextActiveDate: null,
} satisfies Readonly<AccessControlResolverResult>);

const STAFF_OVERRIDE_RESULT = Object.freeze({
  authorized: true,
  credit: 100,
  creditDateString: '100% (Staff override)',
  timeLimitMin: null,
  password: null,
  submittable: true,
  visibility: VISIBLE,
  afterCompleteVisibility: VISIBLE,
  visibilitySource: 'default',
  complete: false,
  examAccessEnd: null,
  showBeforeRelease: false,
  accessTimeline: EMPTY_ACCESS_TIMELINE,
  nextActiveDate: null,
} satisfies Readonly<AccessControlResolverResult>);

const COURSE_ROLE_RANK: Record<EnumCourseRole, number> = {
  None: 0,
  Previewer: 1,
  Viewer: 2,
  Editor: 3,
  Owner: 4,
};
const COURSE_INSTANCE_ROLE_RANK: Record<EnumCourseInstanceRole, number> = {
  None: 0,
  'Student Data Viewer': 1,
  'Student Data Editor': 2,
};

function isStaff(courseRole: EnumCourseRole, courseInstanceRole: EnumCourseInstanceRole): boolean {
  return (
    COURSE_ROLE_RANK[courseRole] >= COURSE_ROLE_RANK.Previewer ||
    COURSE_INSTANCE_ROLE_RANK[courseInstanceRole] >=
      COURSE_INSTANCE_ROLE_RANK['Student Data Viewer']
  );
}

/** Defined keys on `override` replace `base`; undefined keys preserve `base`. */
function mergeDefined<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base) return override;
  if (!override) return base;
  const result: T = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    if (override[key] !== undefined) result[key] = override[key];
  }
  return result;
}

/**
 * Folds an override body onto a base. `dateControl` and `afterComplete` merge
 * per top-level key. `due` replaces as a unit (date + credit move together)
 * since a custom-credit override with an unset date — or vice versa — is
 * incoherent. Default-rule-only fields (`beforeRelease`, `prairieTestExams`)
 * carry through from `a`: `OverrideRuleBody` strips them at the type level so
 * `b` cannot declare them.
 */
export function mergeRules<T extends OverrideRuleBody>(a: T, b: OverrideRuleBody | null): T {
  if (!b) return a;
  return {
    ...a,
    dateControl: mergeDefined(a.dateControl, b.dateControl),
    afterComplete: mergeDefined(a.afterComplete, b.afterComplete),
  };
}

function matchesOverride(override: OverrideRule, enrollment: EnrollmentContext): boolean {
  if (override.targetType === 'enrollment') {
    return override.enrollmentIds.includes(enrollment.enrollmentId);
  }
  return override.studentLabelIds.some((id) => enrollment.studentLabelIds.includes(id));
}

/**
 * Picks and merges the effective rule for a student: the default rule with all
 * matching overrides cascaded on top. Without an enrollment, no override matches.
 *
 * Cascade order: `student_label` overrides apply first (broader), then
 * `enrollment` overrides (more specific, win); within each type, lower `number`
 * applies first.
 */
function pickEffectiveRule(
  rules: AccessControlRuleInput[],
  enrollment: EnrollmentContext | null,
): DefaultRuleBody | null {
  const defaultRule = rules.find((r): r is DefaultRule => r.targetType === 'none');
  if (!defaultRule) return null;
  if (!enrollment) return defaultRule.rule;

  const overrides = rules.filter((r): r is OverrideRule => r.targetType !== 'none');
  const matching = overrides.filter((r) => matchesOverride(r, enrollment));
  matching.sort((a, b) => {
    if (a.targetType !== b.targetType) return a.targetType === 'student_label' ? -1 : 1;
    return a.number - b.number;
  });

  return matching.reduce<DefaultRuleBody>(
    (acc, override) => mergeRules(acc, override.rule),
    defaultRule.rule,
  );
}

/**
 * `questions.hidden` defaults to `true` for exam security (an async exam over
 * several days breaks if early students see answers immediately on leaving
 * Exam mode).
 *
 * Per-rule validation forbids `questions.hidden: false` + `score.hidden: true`,
 * but merging picks `questions` and `score` independently and can produce that
 * pair from valid inputs. Clamp here so downstream sees a consistent state.
 */
function computeTopLevelVisibility(
  afterComplete: RuntimeAfterComplete | undefined,
  date: Date,
): Visibility {
  let showQuestions = resolveVisibility(
    afterComplete?.questions?.hidden ?? true,
    afterComplete?.questions?.visibleFromDate,
    afterComplete?.questions?.visibleUntilDate,
    date,
  );
  const showScore = resolveVisibility(
    afterComplete?.score?.hidden,
    afterComplete?.score?.visibleFromDate,
    undefined,
    date,
  );
  if (!showScore) showQuestions = false;
  return { showQuestions, showScore };
}

/**
 * Visibility while a PrairieTest reservation is active. `readOnly` reservations
 * represent review sessions, so everything is visible. Otherwise, the per-exam
 * `questionsHidden` / `scoreHidden` flags decide. The schema enforces that
 * `scoreHidden: true` + `questionsHidden: false` cannot occur.
 */
function computePrairieTestVisibility(exam: PrairieTestExam): Visibility {
  return {
    showQuestions: exam.readOnly || !exam.questionsHidden,
    showScore: exam.readOnly || !exam.scoreHidden,
  };
}

export function resolveVisibility(
  hide: boolean | undefined,
  visibleFromDate: Date | null | undefined,
  visibleUntilDate: Date | null | undefined,
  date: Date,
): boolean {
  if (!hide) return true;
  if (!visibleFromDate || date < visibleFromDate) return false;
  if (visibleUntilDate && date >= visibleUntilDate) return false;
  return true;
}

export function formatDateShort(date: Date, timezone: string): string {
  // Replicate SQL format: 'HH24:MI, Dy, Mon FMDD'
  // Example: "14:30, Mon, Jan 5"
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('hour')}:${get('minute')}, ${get('weekday')}, ${get('month')} ${get('day')}`;
}

function formatCreditDateString(
  credit: number,
  submittable: boolean,
  nextDeadlineDate: Date | null,
  displayTimezone: string,
): string {
  if (credit <= 0 || !submittable) return 'None';
  if (nextDeadlineDate) {
    return `${credit}% until ${formatDateShort(nextDeadlineDate, displayTimezone)}`;
  }
  return `${credit}%`;
}

function computeTimeLimitMin(
  durationMinutes: number | null | undefined,
  lastSubmittableEnd: Date | null,
  date: Date,
  authzMode: EnumMode,
): number | null {
  if (!durationMinutes) return null;
  if (authzMode === 'Exam') return null;
  if (!lastSubmittableEnd) return durationMinutes;

  // Cap time limit by the time remaining until the last reachable submittable
  // deadline. If the timer hits 0:00 exactly at the deadline, the exam might
  // end fractionally after the deadline (overdue submission), so we subtract
  // 31 seconds to avoid that race. 31 (rather than 30) forces the final value
  // to round down when the cap falls on a half-minute boundary (time limits
  // are stored in whole minutes).
  const secondsUntilDeadline = (lastSubmittableEnd.getTime() - date.getTime()) / 1000 - 31;
  return Math.max(0, Math.round(Math.min(durationMinutes, secondsUntilDeadline / 60)));
}

/**
 * Returns the latest endDate the student can still submit at, walking forward
 * from `current` through contiguous submittable timeline entries. The time
 * limit caps here so duration can span access windows (e.g. 100% credit
 * window → 80% late window) without truncating at the credit drop. Returns
 * `null` if a submittable entry has no end (afterLastDeadline allowing
 * submissions, or an indefinite due date).
 */
function findLastSubmittableEnd(
  accessTimeline: readonly Readonly<AccessTimelineEntry>[],
  currentIdx: number,
): Date | null {
  let end: Date | null = null;
  for (let i = currentIdx; i < accessTimeline.length; i++) {
    const entry = accessTimeline[i];
    if (!entry.submittable) break;
    if (entry.endDate === null) return null;
    end = entry.endDate;
  }
  return end;
}

/**
 * This function is the core of the modern access control system.
 *
 * Given a set of rules, an enrollment, and a date, it returns the access control result.
 *
 * Returns an object that roughly corresponds to the legacy `authz_assessment` sproc.
 */
export function resolveAccessControl(
  input: AccessControlResolverInput,
): AccessControlResolverResult {
  const {
    rules,
    enrollment,
    date,
    displayTimezone,
    authzMode,
    courseRole,
    courseInstanceRole,
    prairieTestReservations,
  } = input;

  if (isStaff(courseRole, courseInstanceRole)) return STAFF_OVERRIDE_RESULT;

  const rule = pickEffectiveRule(rules, enrollment);
  if (!rule) return UNAUTHORIZED_RESULT;

  const afterCompleteVisibility = computeTopLevelVisibility(rule.afterComplete, date);
  const accessTimeline = buildAccessTimeline(rule.dateControl, date);

  // In Exam mode, the only access path is a matching PrairieTest reservation;
  // `dateControl` is intentionally ignored for the access decision. Without a
  // match, hide completed-work visibility too: a student taking one PT exam
  // should not be able to review other released assessments. This also keeps
  // #12579 fixed during the post-reservation Exam-mode grace period.
  if (authzMode === 'Exam') {
    const matched = rule.prairieTestExams.find((exam) =>
      prairieTestReservations.some((r) => r.examUuid === exam.uuid),
    );
    if (!matched) {
      return {
        ...UNAUTHORIZED_RESULT,
        visibility: HIDDEN,
        afterCompleteVisibility: HIDDEN,
        complete: true,
      };
    }

    const reservations = prairieTestReservations.filter((r) => r.examUuid === matched.uuid);
    // Sanity check, this should never happen.
    if (reservations.length !== 1) {
      throw new Error(
        `Expected exactly 1 PrairieTest reservation for exam ${matched.uuid}, found ${reservations.length}`,
      );
    }
    const reservation = reservations[0];
    const examVisibility = computePrairieTestVisibility(matched);
    const submittable = !matched.readOnly;
    return {
      authorized: true,
      credit: 100,
      creditDateString: formatCreditDateString(100, submittable, null, displayTimezone),
      timeLimitMin: null,
      password: null,
      submittable,
      visibility: examVisibility,
      afterCompleteVisibility,
      visibilitySource: 'prairieTest',
      complete: matched.readOnly,
      examAccessEnd: reservation.accessEnd,
      showBeforeRelease: false,
      // The PT reservation governs access; the date-control timeline is
      // irrelevant under a PT grant, so omit it from the student popover.
      accessTimeline: [],
      nextActiveDate: null,
    };
  }

  const hasRelease = !!rule.dateControl?.release;
  const shouldShowBeforeRelease = rule.beforeRelease?.listed ?? false;

  // No DC release configured: either PT-gated (review-only once visibility
  // unlocks; `beforeRelease.listed` is ignored) or a date-less rule (deny).
  if (!hasRelease) {
    if (rule.prairieTestExams.length > 0) {
      const reviewMode = afterCompleteVisibility.showQuestions;
      return {
        ...UNAUTHORIZED_RESULT,
        authorized: reviewMode,
        visibility: afterCompleteVisibility,
        afterCompleteVisibility,
        visibilitySource: 'afterComplete',
        complete: true,
        accessTimeline,
        showBeforeRelease: reviewMode ? false : shouldShowBeforeRelease,
      };
    }
    return {
      ...UNAUTHORIZED_RESULT,
      afterCompleteVisibility,
      accessTimeline,
      showBeforeRelease: shouldShowBeforeRelease,
      nextActiveDate: null,
    };
  }
  // `hasRelease` is true, so `current` is defined unless we have a degenerate window where due ≤ release.
  // Treat degenerate windows as fully unauthorized.
  const currentIdx = accessTimeline.findIndex((e) => e.current);
  const current = currentIdx !== -1 ? accessTimeline[currentIdx] : undefined;
  if (!current) {
    return { ...UNAUTHORIZED_RESULT, afterCompleteVisibility, accessTimeline };
  }

  if (current.startDate === null) {
    return {
      ...UNAUTHORIZED_RESULT,
      afterCompleteVisibility,
      accessTimeline,
      showBeforeRelease: shouldShowBeforeRelease,
      nextActiveDate: current.endDate,
    };
  }

  // afterLastDeadline omitted = no access at all (distinct from
  // allowSubmissions: false which is view-only).
  if (!current.accessible) {
    return {
      ...UNAUTHORIZED_RESULT,
      visibility: afterCompleteVisibility,
      afterCompleteVisibility,
      visibilitySource: 'afterComplete',
      complete: true,
      accessTimeline,
    };
  }

  const complete = current.kind === 'afterLastDeadline' && !current.submittable;
  const visibility = complete ? afterCompleteVisibility : VISIBLE;
  const visibilitySource = complete ? 'afterComplete' : 'default';

  return {
    authorized: true,
    credit: current.credit,
    creditDateString: formatCreditDateString(
      current.credit,
      current.submittable,
      current.endDate,
      displayTimezone,
    ),
    timeLimitMin: computeTimeLimitMin(
      rule.dateControl?.durationMinutes,
      findLastSubmittableEnd(accessTimeline, currentIdx),
      date,
      authzMode,
    ),
    // Password gates active participation only; once the student is in a
    // view-only segment (e.g. afterLastDeadline.allowSubmissions: false),
    // re-prompting for the password would gate review without protecting
    // anything submittable.
    password: current.submittable ? (rule.dateControl?.password ?? null) : null,
    submittable: current.submittable,
    visibility,
    afterCompleteVisibility,
    visibilitySource,
    complete,
    examAccessEnd: null,
    showBeforeRelease: false,
    accessTimeline,
    nextActiveDate: null,
  };
}
