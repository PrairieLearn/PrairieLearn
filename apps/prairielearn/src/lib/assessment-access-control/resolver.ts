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
 * The full body of a main access control rule. Mirrors the JSON shape with
 * dates parsed to `Date`. `beforeRelease` and `prairieTestExams` are only
 * meaningful on the main rule; the override variants of `AccessControlRuleInput`
 * use `OverrideRuleBody` (this type with those fields omitted) so an override
 * can't statically declare flags the resolver only honors on the main rule.
 */
export interface MainRuleBody {
  beforeRelease?: { listed?: boolean };
  prairieTestExams: PrairieTestExam[];
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
}

type OverrideRuleBody = Omit<MainRuleBody, 'beforeRelease' | 'prairieTestExams'>;

/**
 * Discriminated by `targetType`. The main rule (`'none'`, always `number: 0`)
 * carries the full rule body. Override variants (`'enrollment'`, `'student_label'`)
 * carry the narrower `OverrideRuleBody` plus their targeting ids.
 *
 * Helper aliases `MainRule` / `OverrideRule` are exported for narrowing.
 */
export type AccessControlRuleInput =
  | {
      targetType: 'none';
      number: 0;
      rule: MainRuleBody;
    }
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

export type MainRule = Extract<AccessControlRuleInput, { targetType: 'none' }>;
export type OverrideRule = Exclude<AccessControlRuleInput, { targetType: 'none' }>;

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

/** Returns a copy of `obj` with explicitly-undefined keys stripped. */
function definedKeys<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

/**
 * Field-by-field merge: defined keys on `override` replace `base`; undefined
 * keys preserve `base`. Returns `base` (same reference) when `override` is
 * absent, and `override` when `base` is absent.
 */
function mergeDefined<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...definedKeys(override) };
}

/**
 * Combines a rule body with an override body. Used both for the main +
 * cascaded-override merge and for cascading multiple overrides:
 *
 * - `dateControl` and `afterComplete` merge per top-level key. `due` replaces
 *   as a unit (date + credit move together) since a custom-credit override
 *   with an unset date — or vice versa — is incoherent.
 * - Main-rule-only fields (`beforeRelease`, `prairieTestExams`) carry through
 *   from `a` unchanged: `OverrideRuleBody` strips them at the type level so
 *   `b` cannot declare them.
 */
export function mergeRules<T extends OverrideRuleBody>(a: T, b: OverrideRuleBody | null): T {
  if (!b) return a;
  return {
    ...a,
    dateControl: mergeDefined(a.dateControl, b.dateControl),
    afterComplete: mergeDefined(a.afterComplete, b.afterComplete),
  };
}

/**
 * Picks and merges the effective rule for a student: the main rule with all
 * matching overrides cascaded on top. Override matching uses the enrollment's
 * id and student-label memberships; without an enrollment, no override matches.
 */
function pickEffectiveRule(
  rules: AccessControlRuleInput[],
  enrollment: EnrollmentContext | null,
): MainRuleBody | null {
  const main = rules.find((r): r is MainRule => r.targetType === 'none');
  if (!main) return null;

  // Sort: student_label first (broader), enrollment second (more specific, wins in cascade).
  const overrides = rules
    .filter((r): r is OverrideRule => r.targetType !== 'none')
    .sort((a, b) => {
      const typeOrder = (t: OverrideRule['targetType']) => (t === 'student_label' ? 0 : 1);
      const diff = typeOrder(a.targetType) - typeOrder(b.targetType);
      if (diff !== 0) return diff;
      return a.number - b.number;
    });

  let cascaded: OverrideRuleBody | null = null;
  if (enrollment) {
    for (const override of overrides) {
      const matches =
        override.targetType === 'enrollment'
          ? override.enrollmentIds.includes(enrollment.enrollmentId)
          : override.studentLabelIds.some((id) => enrollment.studentLabelIds.includes(id));
      if (matches) {
        cascaded = cascaded ? mergeRules(cascaded, override.rule) : override.rule;
      }
    }
  }

  return mergeRules(main.rule, cascaded);
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
  if (!rule) return { ...UNAUTHORIZED_RESULT };

  const visibility = computeTopLevelVisibility(rule.afterComplete, date);
  const accessTimeline = buildAccessTimeline(rule.dateControl, date);
  const grantedDefaults = {
    showBeforeRelease: false,
    accessTimeline,
    nextActiveDate: null,
  };

  /**
   * Exam mode: the only access path is a matching PrairieTest reservation.
   * - With a match: grant 100% credit, `active` derived from `readOnly`,
   *   visibility from the matched exam's per-exam config.
   * - Without a match: deny, but still propagate top-level visibility so the
   *   gradebook can render closed-assessment rows correctly during the post-
   *   reservation grace period (issue #12579).
   *
   * `dateControl` is intentionally ignored for the access decision — being in
   * Exam mode without a matching reservation shouldn't grant access regardless
   * of date windows. The DC is still consulted for the access timeline.
   */
  if (authzMode === 'Exam') {
    const matched = rule.prairieTestExams.find((exam) =>
      prairieTestReservations.some((r) => r.examUuid === exam.uuid),
    );
    if (!matched) return { ...UNAUTHORIZED_RESULT, ...visibility };

    const reservation = prairieTestReservations.find((r) => r.examUuid === matched.uuid)!;
    const examVisibility = computePrairieTestVisibility(matched);
    const active = !matched.readOnly;
    return {
      authorized: true,
      credit: 100,
      creditDateString: formatCreditDateString(100, active, null, displayTimezone),
      timeLimitMin: null,
      password: null,
      active,
      ...examVisibility,
      examAccessEnd: reservation.accessEnd,
      ...grantedDefaults,
    };
  }

  /**
   * Public mode paths:
   * 1. Listed-only "coming soon": `beforeRelease.listed` is true and we're
   *    either pre-release or have no release configured. Deny but signal listing.
   * 2. Pre-release without a listing flag: deny outright.
   * 3. No release configured: only path is PT review-only (granted iff the rule
   *    is PT-gated AND top-level afterComplete has unlocked questions).
   * 4. Otherwise: grant via the date control.
   */
  const current = accessTimeline.find((e) => e.current);
  const beforeRelease = current?.startDate === null;
  const nextDeadlineDate = current?.endDate ?? null;
  const hasRelease = !!rule.dateControl?.release;
  const listed = rule.beforeRelease?.listed ?? false;

  if (listed && (beforeRelease || !hasRelease)) {
    return {
      ...UNAUTHORIZED_RESULT,
      ...visibility,
      showBeforeRelease: true,
      nextActiveDate: nextDeadlineDate,
    };
  }

  if (beforeRelease) {
    return { ...UNAUTHORIZED_RESULT, ...visibility };
  }

  if (!hasRelease) {
    // PT-gated rule with no DC: review-only path when visibility has unlocked.
    if (rule.prairieTestExams.length > 0 && visibility.showClosedAssessment) {
      return { ...UNAUTHORIZED_RESULT, authorized: true, ...visibility };
    }
    return { ...UNAUTHORIZED_RESULT, ...visibility };
  }

  const credit = current?.credit ?? 0;
  const submittable = current?.submittable ?? false;
  return {
    authorized: true,
    credit,
    creditDateString: formatCreditDateString(credit, submittable, nextDeadlineDate, displayTimezone),
    timeLimitMin: computeTimeLimitMin(
      rule.dateControl?.durationMinutes,
      nextDeadlineDate,
      date,
      authzMode,
    ),
    password: rule.dateControl?.password ?? null,
    active: submittable,
    ...visibility,
    examAccessEnd: null,
    ...grantedDefaults,
  };
}
