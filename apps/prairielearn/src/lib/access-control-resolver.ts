import type { AccessControlJson } from '../schemas/accessControl.js';

import type {
  EnumCourseInstanceRole,
  EnumCourseRole,
  EnumMode,
  EnumModeReason,
} from './db-types.js';

export interface AccessControlRuleInput {
  rule: AccessControlJson;
  number: number;
  targetType: 'none' | 'enrollment' | 'student_label';
  enrollmentIds: string[];
  studentLabelIds: string[];
  prairietestExamUuids: string[];
}

export interface StudentContext {
  enrollmentId: string | null;
  studentLabelIds: string[];
}

export interface PrairieTestReservation {
  examUuid: string;
  accessEnd: Date;
}

export interface AccessControlResolverInput {
  rules: AccessControlRuleInput[];
  student: StudentContext;
  date: Date;
  displayTimezone: string;
  authzMode: EnumMode | null;
  authzModeReason: EnumModeReason | null;
  courseRole: EnumCourseRole;
  courseInstanceRole: EnumCourseInstanceRole;
  prairieTestReservation: PrairieTestReservation | null;
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
  examAccessEnd: Date | null;
  listBeforeRelease: boolean;
  blockAccess: boolean;
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
  listBeforeRelease: false,
  blockAccess: false,
};

const COURSE_ROLE_ORDER: EnumCourseRole[] = ['None', 'Previewer', 'Viewer', 'Editor', 'Owner'];
const COURSE_INSTANCE_ROLE_ORDER: EnumCourseInstanceRole[] = [
  'None',
  'Student Data Viewer',
  'Student Data Editor',
];

function roleAtLeast(actual: EnumCourseRole, minimum: EnumCourseRole): boolean {
  return COURSE_ROLE_ORDER.indexOf(actual) >= COURSE_ROLE_ORDER.indexOf(minimum);
}

function instanceRoleAtLeast(
  actual: EnumCourseInstanceRole,
  minimum: EnumCourseInstanceRole,
): boolean {
  return COURSE_INSTANCE_ROLE_ORDER.indexOf(actual) >= COURSE_INSTANCE_ROLE_ORDER.indexOf(minimum);
}

export function mergeRules(
  main: AccessControlJson,
  override: AccessControlJson | null,
): AccessControlJson {
  if (!override) return main;

  const merged: AccessControlJson = { ...main };

  if (override.enabled !== undefined) merged.enabled = override.enabled;
  if (override.blockAccess !== undefined) merged.blockAccess = override.blockAccess;
  if (override.listBeforeRelease !== undefined) {
    merged.listBeforeRelease = override.listBeforeRelease;
  }

  if (override.dateControl !== undefined) {
    if (!main.dateControl) {
      merged.dateControl = override.dateControl;
    } else {
      merged.dateControl = { ...main.dateControl };
      const ov = override.dateControl;
      if (ov.enabled !== undefined) merged.dateControl.enabled = ov.enabled;
      if (ov.releaseDate !== undefined) merged.dateControl.releaseDate = ov.releaseDate;
      if (ov.dueDate !== undefined) merged.dateControl.dueDate = ov.dueDate;
      if (ov.earlyDeadlines !== undefined) merged.dateControl.earlyDeadlines = ov.earlyDeadlines;
      if (ov.lateDeadlines !== undefined) merged.dateControl.lateDeadlines = ov.lateDeadlines;
      if (ov.afterLastDeadline !== undefined) {
        merged.dateControl.afterLastDeadline = ov.afterLastDeadline;
      }
      if (ov.durationMinutes !== undefined) {
        merged.dateControl.durationMinutes = ov.durationMinutes;
      }
      if (ov.password !== undefined) merged.dateControl.password = ov.password;
    }
  }

  if (override.afterComplete !== undefined) {
    if (!main.afterComplete) {
      merged.afterComplete = override.afterComplete;
    } else {
      merged.afterComplete = { ...main.afterComplete };
      const ov = override.afterComplete;
      if (ov.hideQuestions !== undefined) merged.afterComplete.hideQuestions = ov.hideQuestions;
      if (ov.showQuestionsAgainDate !== undefined) {
        merged.afterComplete.showQuestionsAgainDate = ov.showQuestionsAgainDate;
      }
      if (ov.hideQuestionsAgainDate !== undefined) {
        merged.afterComplete.hideQuestionsAgainDate = ov.hideQuestionsAgainDate;
      }
      if (ov.hideScore !== undefined) merged.afterComplete.hideScore = ov.hideScore;
      if (ov.showScoreAgainDate !== undefined) {
        merged.afterComplete.showScoreAgainDate = ov.showScoreAgainDate;
      }
    }
  }

  return merged;
}

interface CreditResult {
  credit: number;
  active: boolean;
  beforeRelease: boolean;
  nextDeadlineDate: Date | null;
  password: string | null;
  timeLimitMin: number | null;
  listBeforeRelease: boolean;
}

export function computeCredit(
  dateControl: AccessControlJson['dateControl'],
  date: Date,
  effectiveRule: AccessControlJson,
  authzMode: EnumMode | null,
): CreditResult {
  if (!dateControl || dateControl.enabled === false) {
    return {
      credit: 100,
      active: true,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: null,
      timeLimitMin: null,
      listBeforeRelease: false,
    };
  }

  if (dateControl.releaseDate) {
    const releaseDate = new Date(dateControl.releaseDate);
    if (date < releaseDate) {
      return {
        credit: 0,
        active: false,
        beforeRelease: true,
        nextDeadlineDate: releaseDate,
        password: null,
        timeLimitMin: null,
        listBeforeRelease: effectiveRule.listBeforeRelease ?? false,
      };
    }
  }

  // Build timeline segments: each entry is [deadline, creditBefore]
  // The credit value represents what you get if you submit BEFORE this deadline.
  const timeline: { date: Date; credit: number }[] = [];

  if (dateControl.earlyDeadlines) {
    for (const entry of dateControl.earlyDeadlines) {
      timeline.push({ date: new Date(entry.date), credit: entry.credit });
    }
  }

  if (dateControl.dueDate) {
    timeline.push({ date: new Date(dateControl.dueDate), credit: 100 });
  }

  if (dateControl.lateDeadlines) {
    for (const entry of dateControl.lateDeadlines) {
      timeline.push({ date: new Date(entry.date), credit: entry.credit });
    }
  }

  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (timeline.length === 0) {
    return {
      credit: 100,
      active: true,
      beforeRelease: false,
      nextDeadlineDate: null,
      password: dateControl.password ?? null,
      timeLimitMin: computeTimeLimitMin(dateControl.durationMinutes, null, date, authzMode),
      listBeforeRelease: false,
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
        listBeforeRelease: false,
      };
    }
  }

  // We are past the last deadline
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
    listBeforeRelease: false,
  };
}

function computeTimeLimitMin(
  durationMinutes: number | undefined,
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
  showAgainDate: string | undefined,
  hideAgainDate: string | undefined,
  date: Date,
): boolean {
  if (!hide) return true;

  let visible = false;

  if (showAgainDate && date >= new Date(showAgainDate)) {
    visible = true;
  }

  if (visible && hideAgainDate && date >= new Date(hideAgainDate)) {
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

export function resolveAccessControl(
  input: AccessControlResolverInput,
): AccessControlResolverResult {
  const {
    rules,
    student,
    date,
    displayTimezone,
    authzMode,
    authzModeReason,
    courseRole,
    courseInstanceRole,
    prairieTestReservation,
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
      listBeforeRelease: false,
      blockAccess: false,
    };
  }

  const mainRuleInput = rules.find((r) => r.number === 0 && r.targetType === 'none');
  if (!mainRuleInput) {
    return { ...UNAUTHORIZED_RESULT };
  }

  // Enrollment overrides take precedence over student_label overrides, then by number.
  let matchedOverride: AccessControlRuleInput | null = null;
  const overrides = rules
    .filter((r) => r.number !== 0)
    .sort((a, b) => {
      const typeOrder = (t: string) => (t === 'enrollment' ? 0 : 1);
      const diff = typeOrder(a.targetType) - typeOrder(b.targetType);
      if (diff !== 0) return diff;
      return a.number - b.number;
    });

  for (const rule of overrides) {
    if (rule.rule.enabled === false) continue;

    if (rule.targetType === 'enrollment') {
      if (student.enrollmentId && rule.enrollmentIds.includes(student.enrollmentId)) {
        matchedOverride = rule;
        break;
      }
    } else if (rule.targetType === 'student_label') {
      if (rule.studentLabelIds.some((id) => student.studentLabelIds.includes(id))) {
        matchedOverride = rule;
        break;
      }
    }
  }

  const effectiveRule = mergeRules(mainRuleInput.rule, matchedOverride?.rule ?? null);

  if (effectiveRule.enabled === false) {
    return { ...UNAUTHORIZED_RESULT };
  }
  if (effectiveRule.blockAccess) {
    return { ...UNAUTHORIZED_RESULT, blockAccess: true };
  }

  const creditResult = computeCredit(effectiveRule.dateControl, date, effectiveRule, authzMode);

  const prairieTestExamUuids = mainRuleInput.prairietestExamUuids;
  const hasPrairieTestExams = prairieTestExamUuids.length > 0;
  let examAccessEnd: Date | null = null;

  if (hasPrairieTestExams) {
    // Exam-only rule: must be in exam mode with PrairieTest reason
    if (authzMode !== 'Exam' || authzModeReason !== 'PrairieTest') {
      return { ...UNAUTHORIZED_RESULT };
    }

    if (!prairieTestReservation) {
      return { ...UNAUTHORIZED_RESULT };
    }

    if (!prairieTestExamUuids.includes(prairieTestReservation.examUuid)) {
      return { ...UNAUTHORIZED_RESULT };
    }

    examAccessEnd = prairieTestReservation.accessEnd;
  } else if (authzMode === 'Exam' && authzModeReason === 'PrairieTest') {
    // No PrairieTest exams configured but student is in PrairieTest exam mode
    return { ...UNAUTHORIZED_RESULT };
  }

  const timeLimitMin = creditResult.timeLimitMin;

  const showClosedAssessment = resolveVisibility(
    effectiveRule.afterComplete?.hideQuestions,
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

  // If the assessment is before its release date and listBeforeRelease is false,
  // the student should not see or access it at all.
  if (creditResult.beforeRelease && !creditResult.listBeforeRelease) {
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
    listBeforeRelease: creditResult.listBeforeRelease,
    blockAccess: false,
  };
}
