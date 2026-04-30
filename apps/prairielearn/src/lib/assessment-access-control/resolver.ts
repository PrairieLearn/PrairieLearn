import { run } from '@prairielearn/run';

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
 * dates parsed to `Date`. `MainRuleBody` extends this with main-rule-only
 * fields, so an override can't statically declare flags the resolver only
 * honors on the main rule.
 */
interface OverrideRuleBody {
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
}

export interface MainRuleBody extends OverrideRuleBody {
  beforeRelease?: { listed?: boolean };
  prairieTestExams: PrairieTestExam[];
}

/**
 * Discriminated by `targetType`. The main rule (`'none'`, always `number: 0`)
 * carries the full rule body. Override variants (`'enrollment'`, `'student_label'`)
 * carry the narrower `OverrideRuleBody` plus their targeting ids.
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
   * "coming soon" until the instructor later adds dates.
   */
  showBeforeRelease: boolean;
  /**
   * Timeline of credit segments for display. Raw data — formatting is a UI concern.
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
 * incoherent. Main-rule-only fields (`beforeRelease`, `prairieTestExams`)
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

/**
 * Picks and merges the effective rule for a student: the main rule with all
 * matching overrides cascaded on top. Override matching uses the enrollment's
 * id and student-label memberships; without an enrollment, no override matches.
 *
 * Overrides apply student_label first (broader) then enrollment (more specific,
 * wins in cascade); within each type, lower `number` first.
 */
function pickEffectiveRule(
  rules: AccessControlRuleInput[],
  enrollment: EnrollmentContext | null,
): MainRuleBody | null {
  const main = rules.find((r): r is MainRule => r.targetType === 'none');
  if (!main) return null;
  if (!enrollment) return main.rule;

  const matchingOverrides = rules
    .filter((r): r is OverrideRule =>
      run(() => {
        if (r.targetType === 'enrollment') {
          return r.enrollmentIds.includes(enrollment.enrollmentId);
        }
        if (r.targetType === 'student_label') {
          return r.studentLabelIds.some((id) => enrollment.studentLabelIds.includes(id));
        }
        return false;
      }),
    )
    .sort((a, b) => {
      if (a.targetType !== b.targetType) return a.targetType === 'student_label' ? -1 : 1;
      return a.number - b.number;
    });

  return matchingOverrides.reduce<MainRuleBody>(
    (acc, override) => mergeRules(acc, override.rule),
    main.rule,
  );
}

interface Visibility {
  showClosedAssessment: boolean;
  showClosedAssessmentScore: boolean;
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
  if (!rule) return UNAUTHORIZED_RESULT;

  const visibility = computeTopLevelVisibility(rule.afterComplete, date);
  const accessTimeline = buildAccessTimeline(rule.dateControl, date);
  // Used by deny / coming-soon returns. PT-granted paths keep `grantedDefaults`
  // separately so `examVisibility` isn't shadowed by top-level `visibility`.
  const denyDefaults = {
    ...visibility,
    accessTimeline,
  };
  const grantedDefaults = {
    showBeforeRelease: false,
    accessTimeline,
    nextActiveDate: null,
  };

  // In Exam mode, the only access path is a matching PrairieTest reservation;
  // `dateControl` is intentionally ignored for the access decision (still
  // consulted for the timeline). Without a match, we deny but propagate
  // top-level visibility so the gradebook renders correctly during the post-
  // reservation grace period (issue #12579).
  if (authzMode === 'Exam') {
    const matched = rule.prairieTestExams.find((exam) =>
      prairieTestReservations.some((r) => r.examUuid === exam.uuid),
    );
    if (!matched) return { ...UNAUTHORIZED_RESULT, ...denyDefaults };

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

  const current = accessTimeline.find((e) => e.current);
  const beforeRelease = current?.startDate === null;
  const nextDeadlineDate = current?.endDate ?? null;
  const hasRelease = !!rule.dateControl?.release;
  const shouldShowBeforeRelease = rule.beforeRelease?.listed ?? false;

  // PT-gated rule with no DC release: review-only path when visibility has
  // unlocked. We ignore `beforeRelease.listed` here.
  if (!hasRelease && rule.prairieTestExams.length > 0 && visibility.showClosedAssessment) {
    return { ...UNAUTHORIZED_RESULT, authorized: true, ...denyDefaults };
  }

  if (beforeRelease || !hasRelease) {
    return {
      ...UNAUTHORIZED_RESULT,
      ...denyDefaults,
      showBeforeRelease: shouldShowBeforeRelease,
      nextActiveDate: nextDeadlineDate,
    };
  }

  const credit = current?.credit ?? 0;
  const submittable = current?.submittable ?? false;
  return {
    authorized: true,
    credit,
    creditDateString: formatCreditDateString(
      credit,
      submittable,
      nextDeadlineDate,
      displayTimezone,
    ),
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
