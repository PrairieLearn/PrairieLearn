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
  afterLastDeadline?: { allowSubmissions?: boolean; credit?: number } | null;
  durationMinutes?: number | null;
  password?: string | null;
}

export interface RuntimeAfterComplete {
  hideQuestions?: boolean;
  showQuestionsAgainDate?: Date | null;
  hideQuestionsAgainDate?: Date | null;
  hideScore?: boolean;
  showScoreAgainDate?: Date | null;
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
  prairietestExams: { uuid: string; readOnly: boolean }[];
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
  authzMode: EnumMode | null;
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
   * Resolved visibility flag: true when the assessment should be listed but
   * not accessible. This happens when `listBeforeRelease` is set on the rule
   * AND either the current date is before the release date, there is no
   * release date configured, or the assessment is PT-gated and the student
   * lacks access (but only while the assessment is still open — closed
   * assessments are not shown as "before release"). Distinct from the raw
   * `listBeforeRelease` config input.
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
  if (ov.afterLastDeadline !== undefined) merged.afterLastDeadline = ov.afterLastDeadline;
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

  const merged = { ...base };
  if (override.hideQuestions !== undefined) merged.hideQuestions = override.hideQuestions;
  if (override.showQuestionsAgainDate !== undefined) {
    merged.showQuestionsAgainDate = override.showQuestionsAgainDate;
  }
  if (override.hideQuestionsAgainDate !== undefined) {
    merged.hideQuestionsAgainDate = override.hideQuestionsAgainDate;
  }
  if (override.hideScore !== undefined) merged.hideScore = override.hideScore;
  if (override.showScoreAgainDate !== undefined) {
    merged.showScoreAgainDate = override.showScoreAgainDate;
  }
  return merged;
}

export function mergeRules(
  main: RuntimeAccessControl,
  override: RuntimeAccessControl | null,
): RuntimeAccessControl {
  if (!override) return main;

  const merged: RuntimeAccessControl = {};

  // listBeforeRelease is only configurable on the main rule.
  if (main.listBeforeRelease !== undefined) merged.listBeforeRelease = main.listBeforeRelease;

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
  | { action: 'grant'; examAccessEnd: Date; credit: number; active: boolean }
  | { action: 'continue' };

function computeCredit(
  dateControl: RuntimeDateControl | undefined,
  date: Date,
  effectiveRule: RuntimeAccessControl,
  authzMode: EnumMode | null,
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
      // Filter out early deadlines before release date or after/at due date.
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate >= dueDate) continue;
      timeline.push({ date: entryDate, credit: entry.credit });
    }
  }

  if (dueDate) {
    timeline.push({ date: dueDate, credit: 100 });
  }

  if (dateControl.lateDeadlines) {
    for (const entry of dateControl.lateDeadlines) {
      const entryDate = new Date(entry.date);
      // Filter out late deadlines before release date or before/at due date.
      if (entryDate <= releaseDate) continue;
      if (dueDate && entryDate <= dueDate) continue;
      timeline.push({ date: entryDate, credit: entry.credit });
    }
  }

  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  // No due date and no deadlines = no credit granted.
  if (timeline.length === 0) {
    return {
      credit: 0,
      active: false,
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
        active: credit > 0,
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
  const active = credit > 0 && afterLast?.allowSubmissions !== false;
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
  authzMode: EnumMode | null,
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
  showAgainDate: Date | null | undefined,
  hideAgainDate: Date | null | undefined,
  date: Date,
): boolean {
  if (!hide) return true;

  let visible = false;

  if (showAgainDate && date >= showAgainDate) {
    visible = true;
  }

  if (visible && hideAgainDate && date >= hideAgainDate) {
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
 * PrairieTest exam-mode access control.
 *
 * Core invariants (matching legacy `check_assessment_access_rule` sproc):
 * - Student in Exam mode + assessment has PT exams → must have valid reservation
 * - Student in Exam mode + assessment has NO PT exams → deny access
 * - Student NOT in Exam mode + assessment has PT exams → deny access
 * - Valid reservation = user has pt_reservation whose exam UUID matches a configured exam
 *
 * When the assessment is past its due date (`assessmentClosed`), PT gating is
 * skipped so the normal closed-assessment behavior applies instead of showing
 * "Not yet open" indefinitely.
 */
function resolvePrairieTestAccess({
  prairieTestExams,
  prairieTestReservations,
  authzMode,
  listBeforeRelease,
  assessmentClosed,
}: {
  prairieTestExams: { uuid: string; readOnly: boolean }[];
  prairieTestReservations: PrairieTestReservation[];
  authzMode: EnumMode | null;
  listBeforeRelease: boolean;
  assessmentClosed: boolean;
}): PrairieTestOutcome {
  const hasPrairieTestExams = prairieTestExams.length > 0;

  if (!hasPrairieTestExams) {
    // No PT exams configured but student is in PrairieTest exam mode → deny.
    if (authzMode === 'Exam') {
      return { action: 'deny', result: { ...UNAUTHORIZED_RESULT } };
    }
    return { action: 'continue' };
  }

  // Not in exam mode — student cannot access a PT-gated assessment.
  if (authzMode !== 'Exam') {
    if (assessmentClosed) return { action: 'continue' };

    // If `listBeforeRelease` is set, list it, but it should not be accessible.
    // We ONLY do this outside of Exam mode; when in Exam mode, we only show assessments
    // that the user can actually access.
    if (listBeforeRelease) {
      return { action: 'deny', result: { ...UNAUTHORIZED_RESULT, showBeforeRelease: true } };
    }

    return { action: 'deny', result: { ...UNAUTHORIZED_RESULT } };
  }

  // In Exam mode — find a matching reservation.
  const matchedExam = prairieTestExams.find((exam) =>
    prairieTestReservations.some((r) => r.examUuid === exam.uuid),
  );

  if (matchedExam) {
    // Valid reservation found — grant PT access with full credit.
    const matchingReservation = prairieTestReservations.find(
      (r) => r.examUuid === matchedExam.uuid,
    )!;
    return {
      action: 'grant',
      examAccessEnd: matchingReservation.accessEnd,
      credit: 100,
      active: !matchedExam.readOnly,
    };
  }

  // No matching reservation — deny unless the assessment is closed.
  if (assessmentClosed) return { action: 'continue' };
  return { action: 'deny', result: { ...UNAUTHORIZED_RESULT } };
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

  let creditResult = computeCredit(effectiveRule.dateControl, date, effectiveRule, authzMode);

  // Resolve PrairieTest access. This is separated from the main flow to keep
  // the resolver linear: it either denies early, grants PT credit overrides,
  // or continues with the normal date-control-based result.
  const ptOutcome = resolvePrairieTestAccess({
    prairieTestExams: mainRuleInput.prairietestExams,
    prairieTestReservations,
    authzMode,
    listBeforeRelease: effectiveRule.listBeforeRelease ?? false,
    assessmentClosed:
      !!effectiveRule.dateControl?.releaseDate &&
      !creditResult.beforeRelease &&
      !creditResult.active,
  });
  if (ptOutcome.action === 'deny') return ptOutcome.result;

  let examAccessEnd: Date | null = null;
  if (ptOutcome.action === 'grant') {
    creditResult = { ...creditResult, credit: ptOutcome.credit, active: ptOutcome.active };
    examAccessEnd = ptOutcome.examAccessEnd;
  }

  const timeLimitMin = creditResult.timeLimitMin;

  const showClosedAssessment = resolveVisibility(
    effectiveRule.afterComplete?.hideQuestions ?? true,
    effectiveRule.afterComplete?.showQuestionsAgainDate,
    effectiveRule.afterComplete?.hideQuestionsAgainDate,
    date,
  );

  const showClosedAssessmentScore = resolveVisibility(
    effectiveRule.afterComplete?.hideScore,
    effectiveRule.afterComplete?.showScoreAgainDate,
    undefined,
    date,
  );

  // Resolve the raw `listBeforeRelease` config flag into a concrete
  // `showBeforeRelease` boolean: true when the flag is set AND either we're
  // before the release date or there is no release date configured.
  const showBeforeRelease =
    (effectiveRule.listBeforeRelease ?? false) &&
    (creditResult.beforeRelease || !effectiveRule.dateControl?.releaseDate);

  // If the assessment is before its release date and showBeforeRelease is false,
  // the student should not see or access it at all.
  if (creditResult.beforeRelease && !showBeforeRelease) {
    return { ...UNAUTHORIZED_RESULT };
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
