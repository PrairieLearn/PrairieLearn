import assert from 'node:assert';

import type { AccessControlJson } from '../../schemas/accessControl.js';
import type { EnumCourseInstanceRole, EnumCourseRole, EnumMode } from '../db-types.js';

/**
 * Runtime version of date control fields. Top-level date columns use `Date`
 * objects (they come from the database as Date). Deadline entry dates remain
 * as strings since they are stored as JSON strings in JSONB columns.
 */
export interface RuntimeDateControl {
  releaseDate?: Date | null;
  dueDate?: Date | null;
  earlyDeadlines?: { date: string; credit: number }[] | null;
  lateDeadlines?: { date: string; credit: number }[] | null;
  afterLastDeadline?: { allowSubmissions?: boolean; credit?: number | null };
  durationMinutes?: number | null;
  password?: string | null;
}

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
 * Runtime representation of an access control rule, used by the data layer
 * and resolver. Mirrors `AccessControlJson` but uses `Date` objects for
 * top-level date fields instead of ISO strings.
 */
export type RuntimeAccessControl = Omit<AccessControlJson, 'dateControl' | 'afterComplete'> & {
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
};

export interface AccessControlRuleInput {
  rule: RuntimeAccessControl;
  number: number;
  targetType: 'none' | 'enrollment' | 'student_label';
  enrollmentIds: string[];
  studentLabelIds: string[];
  prairietestExams: {
    uuid: string;
    readOnly: boolean;
    questionsHidden: boolean;
    scoreHidden: boolean;
  }[];
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

function roleAtLeast(actual: EnumCourseRole, minimum: EnumCourseRole): boolean {
  return COURSE_ROLE_RANK[actual] >= COURSE_ROLE_RANK[minimum];
}

function instanceRoleAtLeast(
  actual: EnumCourseInstanceRole,
  minimum: EnumCourseInstanceRole,
): boolean {
  return COURSE_INSTANCE_ROLE_RANK[actual] >= COURSE_INSTANCE_ROLE_RANK[minimum];
}

function mergeDateControl(
  base: RuntimeDateControl | undefined,
  override: RuntimeDateControl | undefined,
): RuntimeDateControl | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return { ...base };

  const merged: RuntimeDateControl = { ...base };
  const ov = override;
  if (ov.releaseDate !== undefined) merged.releaseDate = ov.releaseDate;
  if (ov.dueDate !== undefined) merged.dueDate = ov.dueDate;
  if (ov.earlyDeadlines !== undefined) merged.earlyDeadlines = ov.earlyDeadlines;
  if (ov.lateDeadlines !== undefined) merged.lateDeadlines = ov.lateDeadlines;
  if (ov.afterLastDeadline !== undefined) {
    merged.afterLastDeadline = ov.afterLastDeadline;
  }
  if (ov.durationMinutes !== undefined) merged.durationMinutes = ov.durationMinutes;
  if (ov.password !== undefined) merged.password = ov.password;
  return merged;
}

function mergeAfterComplete(
  base: RuntimeAfterComplete | undefined,
  override: RuntimeAfterComplete | undefined,
): RuntimeAfterComplete | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return { ...base };

  const merged: RuntimeAfterComplete = {
    questions: override.questions !== undefined ? override.questions : base.questions,
    score: override.score !== undefined ? override.score : base.score,
  };

  return merged;
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
 * Cascades two override JSONs where the second wins.
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

interface CreditResult {
  credit: number;
  active: boolean;
  beforeRelease: boolean;
  nextDeadlineDate: Date | null;
  password: string | null;
  timeLimitMin: number | null;
}

/**
 * Outcome of PrairieTest access resolution. Used as a discriminated union so
 * the main resolver can handle each case linearly without nested control flow.
 */
type PrairieTestOutcome =
  | { action: 'deny'; result: AccessControlResolverResult }
  | {
      action: 'grant';
      examAccessEnd: Date;
      credit: number;
      active: boolean;
      showClosedAssessment: boolean;
      showClosedAssessmentScore: boolean;
    }
  | { action: 'continue' };

function computeCredit(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
  authzMode: EnumMode,
): CreditResult {
  if (!dateControl?.releaseDate) {
    return {
      credit: 0,
      active: false,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: null,
      timeLimitMin: null,
    };
  }

  const releaseDate = dateControl.releaseDate;
  const dueDate = dateControl.dueDate ?? null;

  if (date < releaseDate) {
    return {
      credit: 0,
      active: false,
      beforeRelease: true,
      nextDeadlineDate: releaseDate,
      password: null,
      timeLimitMin: null,
    };
  }

  // If due date is before release date, access is blocked.
  if (dueDate && dueDate <= releaseDate) {
    return {
      credit: 0,
      active: false,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: null,
      timeLimitMin: null,
    };
  }

  // Build timeline segments: each entry is [deadline, creditBefore]
  // The credit value represents what you get if you submit BEFORE this deadline.
  const timeline: { date: Date; credit: number }[] = [];

  if (dateControl.earlyDeadlines) {
    for (const entry of dateControl.earlyDeadlines) {
      const entryDate = new Date(entry.date);
      // Filter out early deadlines before release date or after due date.
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate > dueDate) continue;
      timeline.push({ date: entryDate, credit: entry.credit });
    }
  }

  if (dueDate) {
    timeline.push({ date: dueDate, credit: 100 });
  }

  if (dateControl.lateDeadlines) {
    for (const entry of dateControl.lateDeadlines) {
      const entryDate = new Date(entry.date);
      // Filter out late deadlines before release date or before due date.
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate < dueDate) continue;
      timeline.push({ date: entryDate, credit: entry.credit });
    }
  }

  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  // No due date or deadlines means 100% credit anytime after the release date.
  if (timeline.length === 0) {
    return {
      credit: 100,
      active: true,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: null,
      timeLimitMin: null,
    };
  }

  // Before the first deadline, the credit is the first entry's credit value.
  // After each deadline, the credit becomes the next entry's credit value.
  // After the last deadline, use afterLastDeadline settings.
  for (const entry of timeline) {
    if (date < entry.date) {
      const credit = entry.credit;
      const nextDeadline = entry.date;
      return {
        credit,
        active: true,
        beforeRelease: false,
        nextDeadlineDate: nextDeadline,
        password: dateControl.password ?? null,
        timeLimitMin: computeTimeLimitMin(
          dateControl.durationMinutes,
          nextDeadline,
          date,
          authzMode,
        ),
      };
    }
  }

  // We are past the last deadline.
  // If there are no deadlines after filtering (only due date was present and we're past it),
  // or if afterLastDeadline is not configured, use defaults.
  const afterLast = dateControl.afterLastDeadline;
  const credit = afterLast?.credit ?? 0;
  assert(!afterLast || afterLast.allowSubmissions !== undefined);
  const active = afterLast?.allowSubmissions === true;
  return {
    credit,
    active,
    beforeRelease: false,
    nextDeadlineDate: null,
    password: dateControl.password ?? null,
    timeLimitMin: computeTimeLimitMin(dateControl.durationMinutes, null, date, authzMode),
  };
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

export function resolveVisibility(
  hide: boolean | undefined,
  visibleFromDate: Date | null | undefined,
  visibleUntilDate: Date | null | undefined,
  date: Date,
): boolean {
  if (!hide) return true;

  let visible = false;

  if (visibleFromDate && date >= visibleFromDate) {
    visible = true;
  }

  if (visible && visibleUntilDate && date >= visibleUntilDate) {
    visible = false;
  }

  return visible;
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

  const hour = get('hour');
  const minute = get('minute');
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');

  return `${hour}:${minute}, ${weekday}, ${month} ${day}`;
}

function formatCreditDateString(
  credit: number,
  active: boolean,
  nextDeadlineDate: Date | null,
  displayTimezone: string,
): string {
  if (credit > 0 && active) {
    const creditStr = `${credit}%`;
    if (nextDeadlineDate) {
      return `${creditStr} until ${formatDateShort(nextDeadlineDate, displayTimezone)}`;
    }
    return creditStr;
  }
  return 'None';
}

/**
 * PrairieTest access control.
 *
 * The resolver treats PT and dateControl as mutually exclusive access paths:
 *
 * - **Exam mode** (student has an active checked-in PrairieTest reservation,
 *   whether at a CBTF or a course-run session): PT is the only path. Access
 *   requires a matching reservation; otherwise deny. dateControl is ignored
 *   entirely — being in Exam mode without a matching reservation shouldn't
 *   grant access regardless of date windows.
 *
 * - **Public mode** (student is not in an active PT session): PT gating
 *   doesn't apply here. Access is governed by dateControl, `afterComplete`,
 *   and `beforeRelease`. This supports the cheat sheet workflow (discussion
 *   #11308) where students submit at home during the dateControl active
 *   window, then review in Exam mode with a readOnly PT reservation. Course
 *   authors are responsible for configuring readOnly appropriately — a
 *   non-readOnly PT exam with an active dateControl window effectively
 *   permits at-home takes, which is usually not the intent. A PT-gated rule
 *   with no dateControl has no at-home access path; `resolveAccessControl`
 *   handles that case by denying authorization after this returns `continue`.
 */
function resolvePrairieTestAccess({
  prairieTestExams,
  prairieTestReservations,
  authzMode,
}: {
  prairieTestExams: AccessControlRuleInput['prairietestExams'];
  prairieTestReservations: PrairieTestReservation[];
  authzMode: EnumMode;
}): PrairieTestOutcome {
  // Outside of Exam mode, PT gating does not apply. Let the main flow
  // (dateControl, afterComplete, beforeRelease) govern access.
  if (authzMode !== 'Exam') return { action: 'continue' };

  const matchedExam = prairieTestExams.find((exam) =>
    prairieTestReservations.some((r) => r.examUuid === exam.uuid),
  );
  if (!matchedExam) {
    return { action: 'deny', result: { ...UNAUTHORIZED_RESULT } };
  }

  const matchingReservation = prairieTestReservations.find((r) => r.examUuid === matchedExam.uuid)!;

  // PT-level visibility. `readOnly` reservations represent review sessions,
  // so everything is visible. Otherwise, the per-exam `questionsHidden` /
  // `scoreHidden` flags decide visibility after the student finishes during
  // a PT reservation. The schema enforces that `scoreHidden: true` +
  // `questionsHidden: false` cannot occur.
  const showClosedAssessment = matchedExam.readOnly || !matchedExam.questionsHidden;
  const showClosedAssessmentScore = matchedExam.readOnly || !matchedExam.scoreHidden;

  return {
    action: 'grant',
    examAccessEnd: matchingReservation.accessEnd,
    credit: 100,
    active: !matchedExam.readOnly,
    showClosedAssessment,
    showClosedAssessmentScore,
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

  if (
    roleAtLeast(courseRole, 'Previewer') ||
    instanceRoleAtLeast(courseInstanceRole, 'Student Data Viewer')
  ) {
    return {
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
    };
  }

  const mainRuleInput = rules.find((r) => r.number === 0 && r.targetType === 'none');
  if (!mainRuleInput) {
    return { ...UNAUTHORIZED_RESULT };
  }

  // Sort: student_label first (broader), enrollment second (more specific, wins in cascade).
  const overrides = rules
    .filter((r) => r.number !== 0)
    .sort((a, b) => {
      const typeOrder = (t: string) => (t === 'student_label' ? 0 : 1);
      const diff = typeOrder(a.targetType) - typeOrder(b.targetType);
      if (diff !== 0) return diff;
      return a.number - b.number;
    });

  // Collect all matching overrides. If the user has no enrollment, no
  // overrides can match (they target enrollments or student labels).
  const matchedOverrides: AccessControlRuleInput[] = [];
  if (enrollment) {
    for (const rule of overrides) {
      if (rule.targetType === 'enrollment') {
        if (rule.enrollmentIds.includes(enrollment.enrollmentId)) {
          matchedOverrides.push(rule);
        }
      } else if (rule.targetType === 'student_label') {
        if (rule.studentLabelIds.some((id) => enrollment.studentLabelIds.includes(id))) {
          matchedOverrides.push(rule);
        }
      }
    }
  }

  // Cascade all matched overrides, then merge with main rule.
  let cascadedOverride: RuntimeAccessControl | null = null;
  for (const override of matchedOverrides) {
    cascadedOverride = cascadedOverride
      ? cascadeOverrides(cascadedOverride, override.rule)
      : override.rule;
  }
  const effectiveRule = mergeRules(mainRuleInput.rule, cascadedOverride);

  let creditResult = computeCredit(effectiveRule.dateControl, date, authzMode);

  // Compute visibility up-front so deny results can still honor the course
  // author's `afterComplete` configuration. The student gradebook displays
  // rows even when access is denied, and relies on `showClosedAssessmentScore`
  // to decide whether to show prior scores.
  //
  // `questions.hidden` defaults to `true` (hidden) in Public mode. This is
  // intentional for exam security: an async exam run over several days would
  // be compromised if first-session students saw questions and answers
  // immediately on leaving Exam mode.
  let showClosedAssessment = resolveVisibility(
    effectiveRule.afterComplete?.questions?.hidden ?? true,
    effectiveRule.afterComplete?.questions?.visibleFromDate,
    effectiveRule.afterComplete?.questions?.visibleUntilDate,
    date,
  );

  let showClosedAssessmentScore = resolveVisibility(
    effectiveRule.afterComplete?.score?.hidden,
    effectiveRule.afterComplete?.score?.visibleFromDate,
    undefined,
    date,
  );

  // Enforce the cross-field invariant after merging: we don't support
  // showing questions (with their submitted answers) while hiding the
  // score. Per-rule validation catches this within a single rule, but
  // `mergeAfterComplete` picks `questions` and `score` sub-objects
  // independently, so a main rule with `questions.hidden: false` merged
  // with an override that sets `score.hidden: true` can produce the
  // invalid combination. Clamp here so every downstream return carries a
  // consistent state.
  if (!showClosedAssessmentScore) {
    showClosedAssessment = false;
  }

  // Resolve PrairieTest access. This is separated from the main flow to keep
  // the resolver linear: it either denies early, grants PT credit overrides,
  // or continues with the normal date-control-based result.
  const ptOutcome = resolvePrairieTestAccess({
    prairieTestExams: mainRuleInput.prairietestExams,
    prairieTestReservations,
    authzMode,
  });
  if (ptOutcome.action === 'deny') {
    return { ...ptOutcome.result, showClosedAssessment, showClosedAssessmentScore };
  }

  let examAccessEnd: Date | null = null;
  if (ptOutcome.action === 'grant') {
    creditResult = {
      credit: ptOutcome.credit,
      active: ptOutcome.active,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: null,
      timeLimitMin: null,
    };
    examAccessEnd = ptOutcome.examAccessEnd;
    showClosedAssessment = ptOutcome.showClosedAssessment;
    showClosedAssessmentScore = ptOutcome.showClosedAssessmentScore;
  }

  const timeLimitMin = creditResult.timeLimitMin;

  // Resolve the raw `beforeRelease.listed` config flag into a concrete
  // `showBeforeRelease` boolean: true when the flag is set AND either we're
  // before the release date or there is no release date configured. An
  // active PT grant always zeroes this — a granted student has real access
  // and shouldn't see the "coming soon" listing regardless of other config.
  const showBeforeRelease =
    (effectiveRule.beforeRelease?.listed ?? false) &&
    ptOutcome.action !== 'grant' &&
    (creditResult.beforeRelease || !effectiveRule.dateControl?.releaseDate);

  // If the assessment is before its release date and showBeforeRelease is false,
  // the student should not see or access it at all.
  if (creditResult.beforeRelease && !showBeforeRelease) {
    return { ...UNAUTHORIZED_RESULT, showClosedAssessment, showClosedAssessmentScore };
  }

  // A "coming soon" listing is a visibility signal only — the student can see
  // the assessment in the list but cannot open it. `authorized` gates real URL
  // access, so anything that produces `showBeforeRelease: true` must also set
  // `authorized: false`. This covers pre-release (`creditResult.beforeRelease`)
  // as well as the perpetually-listed case (`beforeRelease.listed` with no
  // releaseDate configured).
  if (showBeforeRelease) {
    return {
      ...UNAUTHORIZED_RESULT,
      showClosedAssessment,
      showClosedAssessmentScore,
      showBeforeRelease: true,
    };
  }

  // A PT-gated rule has no at-home submission path unless dateControl
  // provides one. When PT continue'd (Public mode) and there is no
  // dateControl releaseDate, the student can't take the assessment at home,
  // but they may still have a legitimate review-only path if top-level
  // `afterComplete` visibility has been unlocked (e.g., a scheduled at-home
  // release via `questions.visibleFromDate`). In that case, grant
  // `authorized: true, active: false` so the middleware can serve the
  // review-only page. Otherwise deny outright.
  if (
    ptOutcome.action === 'continue' &&
    mainRuleInput.prairietestExams.length > 0 &&
    !effectiveRule.dateControl?.releaseDate
  ) {
    if (!showClosedAssessment) {
      return {
        ...UNAUTHORIZED_RESULT,
        showClosedAssessment,
        showClosedAssessmentScore,
      };
    }
    return {
      authorized: true,
      credit: 0,
      creditDateString: 'None',
      timeLimitMin: null,
      password: null,
      active: false,
      showClosedAssessment,
      showClosedAssessmentScore,
      examAccessEnd: null,
      showBeforeRelease: false,
    };
  }

  const creditDateString = formatCreditDateString(
    creditResult.credit,
    creditResult.active,
    creditResult.nextDeadlineDate,
    displayTimezone,
  );

  return {
    authorized: true,
    credit: creditResult.credit,
    creditDateString,
    timeLimitMin,
    password: creditResult.password,
    active: creditResult.active,
    showClosedAssessment,
    showClosedAssessmentScore,
    examAccessEnd,
    showBeforeRelease,
  };
}
