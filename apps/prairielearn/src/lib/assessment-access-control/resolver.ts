import type { EnumCourseInstanceRole, EnumCourseRole, EnumMode } from '../db-types.js';

import {
  type AccessTimelineEntry,
  type CreditAtDate,
  type RuntimeDateControl,
  buildAccessTimeline,
  computeCreditAt,
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

/**
 * Runtime representation of an access control rule. Only carries the fields
 * the resolver actually consumes (`beforeRelease`, `dateControl`, `afterComplete`);
 * other JSON fields like `labels` or `integrations` are surfaced separately on
 * `AccessControlRuleInput` rather than threaded through this shape.
 */
export interface RuntimeAccessControl {
  beforeRelease?: { listed?: boolean };
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
}

export interface PrairieTestExam {
  uuid: string;
  readOnly: boolean;
  questionsHidden: boolean;
  scoreHidden: boolean;
}

export interface AccessControlRuleInput {
  rule: RuntimeAccessControl;
  number: number;
  targetType: 'none' | 'enrollment' | 'student_label';
  enrollmentIds: string[];
  studentLabelIds: string[];
  prairietestExams: PrairieTestExam[];
}

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
  authorized: boolean;
  credit: number | null;
  creditDateString: string | null;
  timeLimitMin: number | null;
  password: string | null;
  active: boolean;
  showClosedAssessment: boolean;
  showClosedAssessmentScore: boolean;
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
   * "coming soon" until the instructor later adds dates. Distinct from the
   * raw `beforeRelease.listed` config input.
   */
  showBeforeRelease: boolean;
  /**
   * Timeline of credit segments for display. Each entry represents a
   * contiguous period where a specific credit percentage applies.
   * Raw data — formatting is a UI concern.
   */
  accessTimeline: AccessTimelineEntry[];
  /**
   * The next date when the assessment becomes active (e.g. the release date
   * when before release). Null when already active or no future open date.
   */
  nextActiveDate: Date | null;
}

const UNAUTHORIZED_RESULT: AccessControlResolverResult = {
  authorized: false,
  credit: 0,
  creditDateString: 'None',
  timeLimitMin: null,
  password: null,
  active: false,
  showClosedAssessment: true,
  showClosedAssessmentScore: true,
  examAccessEnd: null,
  showBeforeRelease: false,
  accessTimeline: [],
  nextActiveDate: null,
};

const STAFF_OVERRIDE_RESULT: AccessControlResolverResult = {
  authorized: true,
  credit: 100,
  creditDateString: '100% (Staff override)',
  timeLimitMin: null,
  password: null,
  active: true,
  showClosedAssessment: true,
  showClosedAssessmentScore: true,
  examAccessEnd: null,
  showBeforeRelease: false,
  accessTimeline: [],
  nextActiveDate: null,
};

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

function mergeDateControl(
  base: RuntimeDateControl | undefined,
  override: RuntimeDateControl | undefined,
): RuntimeDateControl | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return { ...base };

  const merged: RuntimeDateControl = { ...base };
  if (override.release !== undefined) merged.release = override.release;
  // `due` replaces atomically: an override either inherits the entire object or
  // supplies its own. We never merge `date` and `credit` independently because
  // a custom-credit override with an unset date (or vice versa) is incoherent.
  if (override.due !== undefined) merged.due = override.due;
  if (override.earlyDeadlines !== undefined) merged.earlyDeadlines = override.earlyDeadlines;
  if (override.lateDeadlines !== undefined) merged.lateDeadlines = override.lateDeadlines;
  if (override.afterLastDeadline !== undefined)
    merged.afterLastDeadline = override.afterLastDeadline;
  if (override.durationMinutes !== undefined) merged.durationMinutes = override.durationMinutes;
  if (override.password !== undefined) merged.password = override.password;
  return merged;
}

function mergeAfterComplete(
  base: RuntimeAfterComplete | undefined,
  override: RuntimeAfterComplete | undefined,
): RuntimeAfterComplete | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return { ...base };

  return {
    questions: override.questions !== undefined ? override.questions : base.questions,
    score: override.score !== undefined ? override.score : base.score,
  };
}

export function mergeRules(
  main: RuntimeAccessControl,
  override: RuntimeAccessControl | null,
): RuntimeAccessControl {
  if (!override) return main;

  const merged: RuntimeAccessControl = {};

  // beforeRelease is only configurable on the main rule.
  if (main.beforeRelease !== undefined) merged.beforeRelease = main.beforeRelease;

  merged.dateControl = mergeDateControl(main.dateControl, override.dateControl);
  merged.afterComplete = mergeAfterComplete(main.afterComplete, override.afterComplete);

  return merged;
}

/**
 * Cascades two override rules where the second wins.
 */
export function cascadeOverrides(
  base: RuntimeAccessControl,
  next: RuntimeAccessControl,
): RuntimeAccessControl {
  return {
    dateControl: mergeDateControl(base.dateControl, next.dateControl),
    afterComplete: mergeAfterComplete(base.afterComplete, next.afterComplete),
  };
}

interface EffectiveRule {
  rule: RuntimeAccessControl;
  prairieTestExams: PrairieTestExam[];
}

/**
 * Picks and merges the effective rule for a student: the main rule with all
 * matching overrides cascaded on top. Override matching uses the enrollment's
 * id and student-label memberships; without an enrollment, no override matches.
 */
function pickEffectiveRule(
  rules: AccessControlRuleInput[],
  enrollment: EnrollmentContext | null,
): EffectiveRule | null {
  const main = rules.find((r) => r.number === 0 && r.targetType === 'none');
  if (!main) return null;

  // Sort: student_label first (broader), enrollment second (more specific, wins in cascade).
  const overrides = rules
    .filter((r) => r.number !== 0)
    .sort((a, b) => {
      const typeOrder = (t: string) => (t === 'student_label' ? 0 : 1);
      const diff = typeOrder(a.targetType) - typeOrder(b.targetType);
      if (diff !== 0) return diff;
      return a.number - b.number;
    });

  let cascaded: RuntimeAccessControl | null = null;
  if (enrollment) {
    for (const override of overrides) {
      const matches =
        override.targetType === 'enrollment'
          ? override.enrollmentIds.includes(enrollment.enrollmentId)
          : override.targetType === 'student_label' &&
            override.studentLabelIds.some((id) => enrollment.studentLabelIds.includes(id));
      if (matches) {
        cascaded = cascaded ? cascadeOverrides(cascaded, override.rule) : override.rule;
      }
    }
  }

  return { rule: mergeRules(main.rule, cascaded), prairieTestExams: main.prairietestExams };
}

interface Visibility {
  showClosedAssessment: boolean;
  showClosedAssessmentScore: boolean;
}

/**
 * `questions.hidden` defaults to `true` (hidden) in Public mode. This is
 * intentional for exam security: an async exam run over several days would
 * be compromised if first-session students saw questions and answers
 * immediately on leaving Exam mode.
 *
 * Per-rule validation forbids `questions.hidden: false` alongside
 * `score.hidden: true`, but `mergeAfterComplete` picks `questions` and `score`
 * sub-objects independently — a main rule's visible-questions merged with an
 * override's hidden-score can produce that forbidden pair. We clamp here so
 * every downstream caller sees a consistent state.
 */
function computeTopLevelVisibility(
  afterComplete: RuntimeAfterComplete | undefined,
  date: Date,
): Visibility {
  let showClosedAssessment = resolveVisibility(
    afterComplete?.questions?.hidden ?? true,
    afterComplete?.questions?.visibleFromDate,
    afterComplete?.questions?.visibleUntilDate,
    date,
  );
  const showClosedAssessmentScore = resolveVisibility(
    afterComplete?.score?.hidden,
    afterComplete?.score?.visibleFromDate,
    undefined,
    date,
  );
  if (!showClosedAssessmentScore) showClosedAssessment = false;
  return { showClosedAssessment, showClosedAssessmentScore };
}

/**
 * Visibility while a PrairieTest reservation is active. `readOnly` reservations
 * represent review sessions, so everything is visible. Otherwise, the per-exam
 * `questionsHidden` / `scoreHidden` flags decide. The schema enforces that
 * `scoreHidden: true` + `questionsHidden: false` cannot occur.
 */
function computePrairieTestVisibility(exam: PrairieTestExam): Visibility {
  return {
    showClosedAssessment: exam.readOnly || !exam.questionsHidden,
    showClosedAssessmentScore: exam.readOnly || !exam.scoreHidden,
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
  active: boolean,
  nextDeadlineDate: Date | null,
  displayTimezone: string,
): string {
  if (credit <= 0 || !active) return 'None';
  if (nextDeadlineDate) {
    return `${credit}% until ${formatDateShort(nextDeadlineDate, displayTimezone)}`;
  }
  return `${credit}%`;
}

function computeTimeLimitMin(
  durationMinutes: number | null | undefined,
  nextDeadline: Date | null,
  date: Date,
  authzMode: EnumMode,
): number | null {
  if (!durationMinutes) return null;
  if (authzMode === 'Exam') return null;
  if (!nextDeadline) return durationMinutes;

  // Cap time limit by seconds until next deadline, minus 31 seconds (legacy behavior).
  const secondsUntilDeadline = (nextDeadline.getTime() - date.getTime()) / 1000 - 31;
  return Math.max(0, Math.floor(Math.min(durationMinutes, secondsUntilDeadline / 60)));
}

/**
 * Exam-mode resolution.
 *
 * In Exam mode, the only access path is a matching PrairieTest reservation.
 * - With a match: grant 100% credit, with `active` derived from `readOnly`,
 *   and visibility from the matched exam's per-exam config.
 * - Without a match: deny, but still propagate top-level visibility so the
 *   gradebook can render closed-assessment rows correctly during the post-
 *   reservation grace period (issue #12579).
 *
 * `dateControl` is intentionally ignored for the access decision — being in
 * Exam mode without a matching reservation shouldn't grant access regardless
 * of date windows. The DC is still consulted for the access timeline.
 */
function resolveExamMode(
  effective: EffectiveRule,
  reservations: PrairieTestReservation[],
  topLevelVisibility: Visibility,
  date: Date,
  displayTimezone: string,
): AccessControlResolverResult {
  const matched = effective.prairieTestExams.find((exam) =>
    reservations.some((r) => r.examUuid === exam.uuid),
  );
  if (!matched) {
    return { ...UNAUTHORIZED_RESULT, ...topLevelVisibility };
  }

  const reservation = reservations.find((r) => r.examUuid === matched.uuid)!;
  const visibility = computePrairieTestVisibility(matched);
  const active = !matched.readOnly;

  return {
    authorized: true,
    credit: 100,
    creditDateString: formatCreditDateString(100, active, null, displayTimezone),
    timeLimitMin: null,
    password: null,
    active,
    ...visibility,
    examAccessEnd: reservation.accessEnd,
    showBeforeRelease: false,
    accessTimeline: buildAccessTimeline(effective.rule.dateControl, date),
    nextActiveDate: null,
  };
}

/**
 * Public-mode resolution. The path is:
 *
 * 1. Listed-only "coming soon": `beforeRelease.listed` is true and we're either
 *    pre-release or have no release configured. Deny access but signal listing.
 * 2. Pre-release without a listing flag: deny outright.
 * 3. No release configured: only path is PT review-only (granted iff the rule
 *    is PT-gated AND top-level afterComplete has unlocked questions).
 * 4. Otherwise: grant via the date control.
 */
function resolvePublicMode(
  effective: EffectiveRule,
  visibility: Visibility,
  date: Date,
  displayTimezone: string,
  authzMode: EnumMode,
): AccessControlResolverResult {
  const credit = computeCreditAt(effective.rule.dateControl, date);
  const hasRelease = !!effective.rule.dateControl?.release;
  const listed = effective.rule.beforeRelease?.listed ?? false;

  if (listed && (credit.beforeRelease || !hasRelease)) {
    return {
      ...UNAUTHORIZED_RESULT,
      ...visibility,
      showBeforeRelease: true,
      nextActiveDate: credit.nextDeadlineDate,
    };
  }

  if (credit.beforeRelease) {
    return { ...UNAUTHORIZED_RESULT, ...visibility };
  }

  if (!hasRelease) {
    // PT-gated rule with no DC: review-only path when visibility has unlocked.
    if (effective.prairieTestExams.length > 0 && visibility.showClosedAssessment) {
      return {
        ...UNAUTHORIZED_RESULT,
        authorized: true,
        ...visibility,
      };
    }
    return { ...UNAUTHORIZED_RESULT, ...visibility };
  }

  return {
    authorized: true,
    credit: credit.credit,
    creditDateString: formatCreditDateString(
      credit.credit,
      credit.active,
      credit.nextDeadlineDate,
      displayTimezone,
    ),
    timeLimitMin: computeTimeLimitMin(
      effective.rule.dateControl?.durationMinutes,
      credit.nextDeadlineDate,
      date,
      authzMode,
    ),
    password: effective.rule.dateControl?.password ?? null,
    active: credit.active,
    ...visibility,
    examAccessEnd: null,
    showBeforeRelease: false,
    accessTimeline: buildAccessTimeline(effective.rule.dateControl, date),
    nextActiveDate: null,
  };
}

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

  const effective = pickEffectiveRule(rules, enrollment);
  if (!effective) return { ...UNAUTHORIZED_RESULT };

  const visibility = computeTopLevelVisibility(effective.rule.afterComplete, date);

  if (authzMode === 'Exam') {
    return resolveExamMode(effective, prairieTestReservations, visibility, date, displayTimezone);
  }
  return resolvePublicMode(effective, visibility, date, displayTimezone, authzMode);
}

// Re-export for tests that exercise the timeline credit logic directly.
export type { CreditAtDate };
