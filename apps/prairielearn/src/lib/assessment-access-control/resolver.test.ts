import { describe, expect, it } from 'vitest';

import type { AccessControlJson } from '../../schemas/accessControl.js';

import {
  type AccessControlResolverInput,
  type AccessControlResolverResult,
  type AccessControlRuleInput,
  type DefaultRule,
  type DefaultRuleBody,
  type EnrollmentContext,
  type OverrideRule,
  type PrairieTestExam,
  type PrairieTestReservation,
  formatDateShort,
  mergeRules,
  resolveAccessControl,
  resolveVisibility,
} from './resolver.js';

/**
 * Converts an `AccessControlJson` (string dates) to `DefaultRuleBody`
 * (Date dates) for use in tests. Only the fields the resolver consumes are
 * carried over.
 */
function toRuntime(json: AccessControlJson): DefaultRuleBody {
  const result: DefaultRuleBody = { prairieTestExams: [] };
  if (json.beforeRelease) result.beforeRelease = json.beforeRelease;
  if (json.dateControl) {
    const { release, due, ...dcRest } = json.dateControl;
    result.dateControl = {
      ...dcRest,
      release: release !== undefined ? { date: new Date(release.date) } : undefined,
      due:
        due !== undefined
          ? {
              date: due.date !== null ? new Date(due.date) : null,
              ...(due.credit !== undefined ? { credit: due.credit } : {}),
            }
          : undefined,
    };
  }
  if (json.afterComplete) {
    result.afterComplete = {};
    if (json.afterComplete.questions) {
      const q = json.afterComplete.questions;
      result.afterComplete.questions = {
        hidden: q.hidden,
        visibleFromDate:
          q.visibleFromDate != null ? new Date(q.visibleFromDate) : q.visibleFromDate,
        visibleUntilDate:
          q.visibleUntilDate != null ? new Date(q.visibleUntilDate) : q.visibleUntilDate,
      };
    }
    if (json.afterComplete.score) {
      const s = json.afterComplete.score;
      result.afterComplete.score = {
        hidden: s.hidden,
        visibleFromDate:
          s.visibleFromDate != null ? new Date(s.visibleFromDate) : s.visibleFromDate,
      };
    }
  }
  return result;
}

function ptExam(
  uuid: string,
  opts: {
    readOnly?: boolean;
    questionsHidden?: boolean;
    scoreHidden?: boolean;
  } = {},
): PrairieTestExam {
  return {
    uuid,
    readOnly: opts.readOnly ?? false,
    questionsHidden: opts.questionsHidden ?? false,
    scoreHidden: opts.scoreHidden ?? false,
  };
}

function makeDefaultRule(
  rule: AccessControlJson = {},
  opts: { prairieTestExams?: PrairieTestExam[] } = {},
): DefaultRule {
  // Validation requires both `release` and `due` on the default rule when
  // `dateControl` is specified. Mirror that here so test fixtures match what
  // production rules look like; use `due: { date: null }` for indefinite due.
  if (rule.dateControl) {
    if (!rule.dateControl.release) {
      throw new Error('makeDefaultRule: dateControl requires release');
    }
    if (!rule.dateControl.due) {
      throw new Error(
        'makeDefaultRule: dateControl requires due (use { date: null } for indefinite)',
      );
    }
  }
  const runtimeRule = toRuntime(rule);
  if (opts.prairieTestExams !== undefined) runtimeRule.prairieTestExams = opts.prairieTestExams;
  return {
    targetType: 'none',
    number: 0,
    rule: runtimeRule,
  };
}

function makeOverrideRule(
  number: number,
  rule: AccessControlJson,
  opts: {
    targetType?: 'enrollment' | 'student_label';
    enrollmentIds?: string[];
    studentLabelIds?: string[];
  } = {},
): OverrideRule {
  if (opts.targetType === 'student_label') {
    return {
      targetType: 'student_label',
      number,
      rule: toRuntime(rule),
      studentLabelIds: opts.studentLabelIds ?? [],
    };
  }
  return {
    targetType: 'enrollment',
    number,
    rule: toRuntime(rule),
    enrollmentIds: opts.enrollmentIds ?? [],
  };
}

const defaultEnrollment: EnrollmentContext = {
  enrollmentId: 'enroll-1',
  studentLabelIds: ['label-1'],
};

const baseInput: AccessControlResolverInput = {
  rules: [makeDefaultRule()],
  enrollment: defaultEnrollment,
  date: new Date('2025-03-15T12:00:00Z'),
  displayTimezone: 'America/Chicago',
  authzMode: 'Public',
  courseRole: 'None',
  courseInstanceRole: 'None',
  prairieTestReservations: [],
};

interface ResolveCase {
  name: string;
  rules?: AccessControlRuleInput[];
  date?: Date;
  authzMode?: AccessControlResolverInput['authzMode'];
  courseRole?: AccessControlResolverInput['courseRole'];
  courseInstanceRole?: AccessControlResolverInput['courseInstanceRole'];
  enrollment?: EnrollmentContext | null;
  reservations?: PrairieTestReservation[];
  expect: Partial<AccessControlResolverResult> &
    Pick<AccessControlResolverResult, 'authorized' | 'submittable'>;
}

function runCase(c: ResolveCase): AccessControlResolverResult {
  return resolveAccessControl({
    ...baseInput,
    ...(c.rules !== undefined ? { rules: c.rules } : {}),
    ...(c.date !== undefined ? { date: c.date } : {}),
    ...(c.authzMode !== undefined ? { authzMode: c.authzMode } : {}),
    ...(c.courseRole !== undefined ? { courseRole: c.courseRole } : {}),
    ...(c.courseInstanceRole !== undefined ? { courseInstanceRole: c.courseInstanceRole } : {}),
    ...(c.enrollment !== undefined ? { enrollment: c.enrollment } : {}),
    ...(c.reservations !== undefined ? { prairieTestReservations: c.reservations } : {}),
  });
}

describe('resolveAccessControl', () => {
  describe('staff override', () => {
    it.each<ResolveCase>([
      {
        name: 'Previewer course role',
        courseRole: 'Previewer',
        expect: {
          authorized: true,
          credit: 100,
          submittable: true,
          creditDateString: '100% (Staff override)',
          timeLimitMin: null,
          password: null,
        },
      },
      {
        name: 'Viewer course role',
        courseRole: 'Viewer',
        expect: {
          authorized: true,
          credit: 100,
          submittable: true,
          creditDateString: '100% (Staff override)',
        },
      },
      {
        name: 'Editor course role',
        courseRole: 'Editor',
        expect: { authorized: true, submittable: true, creditDateString: '100% (Staff override)' },
      },
      {
        name: 'Owner course role',
        courseRole: 'Owner',
        expect: { authorized: true, submittable: true, creditDateString: '100% (Staff override)' },
      },
      {
        name: 'Student Data Viewer instance role',
        courseInstanceRole: 'Student Data Viewer',
        expect: { authorized: true, submittable: true, creditDateString: '100% (Staff override)' },
      },
      {
        name: 'Student Data Editor instance role',
        courseInstanceRole: 'Student Data Editor',
        expect: { authorized: true, submittable: true, creditDateString: '100% (Staff override)' },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });

    it('does not grant staff override for None/None roles', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.authorized).toBe(false);
      expect(result.creditDateString).not.toBe('100% (Staff override)');
    });
  });

  describe('default rule, date control basics', () => {
    it.each<ResolveCase>([
      {
        name: 'no dateControl: unauthorized',
        expect: { authorized: false, credit: 0, submittable: false, nextActiveDate: null },
      },
      {
        name: 'no rules at all: unauthorized with creditDateString=None',
        rules: [],
        expect: { authorized: false, submittable: false, credit: 0, creditDateString: 'None' },
      },
      {
        name: 'before release date: unauthorized, nextActiveDate is release date',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-04-01T00:00:00Z' },
              due: { date: '2025-05-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: false,
          credit: 0,
          submittable: false,
          nextActiveDate: new Date('2025-04-01T00:00:00Z'),
        },
      },
      {
        name: 'between release and due date: 100% credit',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-05-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: true, credit: 100, submittable: true },
      },
      {
        name: 'after due date with no afterLastDeadline: complete review-only',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: {
          authorized: true,
          credit: 0,
          submittable: false,
          complete: true,
          visibilitySource: 'afterComplete',
        },
      },
      {
        name: 'after due date with explicit afterLastDeadline: null: complete review-only',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: null,
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: {
          authorized: true,
          credit: 0,
          submittable: false,
          complete: true,
          visibilitySource: 'afterComplete',
        },
      },
      {
        name: 'after release date with indefinite due: 100% credit forever',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: null },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 100, submittable: true },
      },
      {
        name: 'propagates password and time limit when no deadlines',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: null },
              password: 'secret',
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, password: 'secret', timeLimitMin: 60 },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('late deadlines', () => {
    const lateDeadlinesRule = makeDefaultRule({
      dateControl: {
        release: { date: '2025-03-01T00:00:00Z' },
        due: { date: '2025-03-10T00:00:00Z' },
        lateDeadlines: [
          { date: '2025-03-15T00:00:00Z', credit: 80 },
          { date: '2025-03-20T00:00:00Z', credit: 50 },
        ],
      },
    });

    it.each<ResolveCase>([
      {
        name: '80% credit in first late period',
        rules: [lateDeadlinesRule],
        date: new Date('2025-03-12T00:00:00Z'),
        expect: { authorized: true, credit: 80, submittable: true },
      },
      {
        name: '50% credit in second late period',
        rules: [lateDeadlinesRule],
        date: new Date('2025-03-17T00:00:00Z'),
        expect: { authorized: true, credit: 50, submittable: true },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });

    // Regression: 0% late deadline credit should still be active during the
    // late window, then inactive afterwards.
    const zeroCreditLateRule = makeDefaultRule({
      dateControl: {
        release: { date: '2025-03-01T00:00:00Z' },
        due: { date: '2025-03-10T00:00:00Z' },
        lateDeadlines: [{ date: '2025-03-15T00:00:00Z', credit: 0 }],
      },
    });

    it.each<ResolveCase>([
      {
        name: '0% credit late deadline: active during the late window',
        rules: [zeroCreditLateRule],
        date: new Date('2025-03-12T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: true },
      },
      {
        name: '0% credit late deadline: complete review-only after the late window',
        rules: [zeroCreditLateRule],
        date: new Date('2025-03-16T00:00:00Z'),
        expect: {
          authorized: true,
          credit: 0,
          submittable: false,
          complete: true,
          visibilitySource: 'afterComplete',
        },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('afterLastDeadline', () => {
    it.each<ResolveCase>([
      {
        name: 'uses configured credit when allowSubmissions',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { credit: 25, allowSubmissions: true },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 25, submittable: true },
      },
      {
        name: 'allowSubmissions=false: inactive with 0 credit',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { allowSubmissions: false },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: false },
      },
      {
        name: 'override disabling submissions clears inherited credit',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { credit: 25, allowSubmissions: true },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { afterLastDeadline: { allowSubmissions: false } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: false },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('password', () => {
    it.each<ResolveCase>([
      {
        name: 'propagated in submittable segment',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
              password: 'secret',
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, password: 'secret' },
      },
      {
        // Once submissions are disallowed, the password would gate review of
        // already-completed work without protecting anything submittable.
        name: 'null in view-only afterLastDeadline segment',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { allowSubmissions: false },
              password: 'secret',
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: false, password: null },
      },
      {
        name: 'propagated when afterLastDeadline still allows submissions',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { credit: 50, allowSubmissions: true },
              password: 'secret',
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, password: 'secret' },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('beforeRelease.listed', () => {
    it.each<ResolveCase>([
      {
        // showBeforeRelease is visibility-only; authorized stays false so the
        // student can see the "coming soon" listing but cannot open the URL.
        name: 'set and before release: showBeforeRelease=true, unauthorized',
        rules: [
          makeDefaultRule({
            beforeRelease: { listed: true },
            dateControl: {
              release: { date: '2025-04-01T00:00:00Z' },
              due: { date: '2025-05-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: false,
          showBeforeRelease: true,
          submittable: false,
          nextActiveDate: new Date('2025-04-01T00:00:00Z'),
        },
      },
      {
        name: 'after release: showBeforeRelease=false',
        rules: [
          makeDefaultRule({
            beforeRelease: { listed: true },
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-05-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: true, submittable: true, showBeforeRelease: false },
      },
      {
        // Supported use case: instructor lists every assessment a student will
        // take over the term, perpetually "coming soon" until dates are added.
        name: 'beforeRelease.listed alone (no dateControl)',
        rules: [makeDefaultRule({ beforeRelease: { listed: true } })],
        expect: {
          authorized: false,
          showBeforeRelease: true,
          submittable: false,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'no beforeRelease and no dateControl',
        rules: [makeDefaultRule({})],
        expect: { authorized: false, submittable: false, showBeforeRelease: false },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('early deadline bonus credit', () => {
    it.each<ResolveCase & { earlyDate: string }>([
      {
        name: 'before early deadline: 110%',
        date: new Date('2025-03-05T00:00:00Z'),
        earlyDate: '2025-03-10T00:00:00Z',
        expect: { authorized: true, submittable: true, credit: 110 },
      },
      {
        name: 'after early deadline but before due date: 100%',
        date: new Date('2025-03-12T00:00:00Z'),
        earlyDate: '2025-03-10T00:00:00Z',
        expect: { authorized: true, submittable: true, credit: 100 },
      },
      {
        name: 'before early deadline equal to due date: 110%',
        date: new Date('2025-03-12T00:00:00Z'),
        earlyDate: '2025-03-20T00:00:00Z',
        expect: { authorized: true, submittable: true, credit: 110 },
      },
    ])('$name', ({ earlyDate, ...c }) => {
      expect(
        runCase({
          ...c,
          rules: [
            makeDefaultRule({
              dateControl: {
                release: { date: '2025-03-01T00:00:00Z' },
                earlyDeadlines: [{ date: earlyDate, credit: 110 }],
                due: { date: '2025-03-20T00:00:00Z' },
              },
            }),
          ],
        }),
      ).toMatchObject(c.expect);
    });
  });

  describe('override targeting', () => {
    const defaultRule = makeDefaultRule({
      dateControl: {
        release: { date: '2025-01-01T00:00:00Z' },
        due: { date: '2025-04-01T00:00:00Z' },
      },
    });

    it.each<ResolveCase>([
      {
        name: 'enrollment override matches → applies (extends due to May)',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        expect: { authorized: true, credit: 100, submittable: true },
      },
      {
        name: 'enrollment override does not match → default rule applies (past due)',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-other'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: false, complete: true },
      },
      {
        name: 'no enrollment context → enrollment override skipped',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: null,
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: false, credit: 0, complete: true },
      },
      {
        name: 'student_label override matches via label intersection',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-1', 'label-2'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
        expect: { authorized: true, submittable: true, credit: 100 },
      },
      {
        name: 'student_label override does not match (no intersection)',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-other'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: false, credit: 0, complete: true },
      },
      {
        name: 'override with explicit afterLastDeadline: null disables submissions after due',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { allowSubmissions: false },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { afterLastDeadline: null } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: false, credit: 0, complete: true },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('override precedence', () => {
    const defaultRule = makeDefaultRule({
      dateControl: {
        release: { date: '2025-01-01T00:00:00Z' },
        due: { date: '2025-04-01T00:00:00Z' },
      },
    });

    it.each<ResolveCase>([
      {
        // Enrollment (due Jun 1 UTC = May 31 CDT) wins over student_label (Jul 1)
        name: 'enrollment override wins over student_label override',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-06-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-07-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
        ],
        expect: {
          authorized: true,
          submittable: true,
          creditDateString: expect.stringContaining('May 31'),
        },
      },
      {
        name: 'enrollment override wins even when student_label has lower number and is listed first',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-07-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            2,
            { dateControl: { due: { date: '2025-06-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        expect: {
          authorized: true,
          submittable: true,
          creditDateString: expect.stringContaining('May 31'),
        },
      },
      {
        // Only student_label matches → due Jul 1 UTC = Jun 30 CDT
        name: 'student_label override applies when no enrollment override matches',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-06-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-other'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-07-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
        ],
        expect: {
          authorized: true,
          submittable: true,
          creditDateString: expect.stringContaining('Jun 30'),
        },
      },
      {
        // Both apply via cascading; later number wins (Aug 1 UTC = Jul 31 CDT)
        name: 'both enrollment overrides apply, later number wins',
        rules: [
          defaultRule,
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-06-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
          makeOverrideRule(
            2,
            { dateControl: { due: { date: '2025-08-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        expect: {
          authorized: true,
          submittable: true,
          creditDateString: expect.stringContaining('Jul 31'),
        },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('override field merging', () => {
    it.each<ResolveCase>([
      {
        name: 'fields from different overrides merge together',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-06-01T00:00:00Z' } } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { password: 'override-pw' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        expect: {
          authorized: true,
          submittable: true,
          password: 'override-pw',
          // Due Jun 1 UTC = May 31 CDT
          creditDateString: expect.stringContaining('May 31'),
        },
      },
      {
        name: 'override only overrides explicitly-set fields (password inherits)',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
              password: 'secret123',
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        expect: { authorized: true, submittable: true, password: 'secret123', credit: 100 },
      },
      {
        name: 'override can override password',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
              password: 'default-pass',
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { password: 'override-pass' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        expect: { authorized: true, submittable: true, password: 'override-pass' },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('PrairieTest integration', () => {
    const ptDefaultRule = makeDefaultRule({}, { prairieTestExams: [ptExam('exam-uuid-1')] });
    const validReservation: PrairieTestReservation = {
      examUuid: 'exam-uuid-1',
      accessEnd: new Date('2025-03-15T14:00:00Z'),
    };

    it.each<ResolveCase>([
      {
        name: 'valid reservation grants 100% active access',
        rules: [ptDefaultRule],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: {
          authorized: true,
          credit: 100,
          submittable: true,
          examAccessEnd: validReservation.accessEnd,
        },
      },
      {
        // PT reservations only apply in Exam mode; no DC means no at-home path.
        name: 'Public mode with PT-gated rule and no DC: denied',
        rules: [ptDefaultRule],
        authzMode: 'Public',
        reservations: [validReservation],
        expect: {
          authorized: false,
          submittable: false,
          credit: 0,
          visibility: { showQuestions: false, showScore: true },
        },
      },
      {
        name: 'reservation UUID does not match: denied',
        rules: [ptDefaultRule],
        authzMode: 'Exam',
        reservations: [{ examUuid: 'wrong-uuid', accessEnd: new Date('2025-03-15T14:00:00Z') }],
        expect: {
          authorized: false,
          submittable: false,
          visibility: { showQuestions: false, showScore: false },
          afterCompleteVisibility: { showQuestions: false, showScore: false },
        },
      },
      {
        name: 'no reservation: denied',
        rules: [ptDefaultRule],
        authzMode: 'Exam',
        reservations: [],
        expect: {
          authorized: false,
          submittable: false,
          visibility: { showQuestions: false, showScore: false },
          afterCompleteVisibility: { showQuestions: false, showScore: false },
        },
      },
      {
        name: 'matching reservation among multiple: granted',
        rules: [ptDefaultRule],
        authzMode: 'Exam',
        reservations: [
          { examUuid: 'other-exam-uuid', accessEnd: new Date('2025-03-15T16:00:00Z') },
          validReservation,
        ],
        expect: { authorized: true, submittable: true, examAccessEnd: validReservation.accessEnd },
      },
      {
        name: 'readOnly exam: authorized but inactive',
        rules: [
          makeDefaultRule({}, { prairieTestExams: [ptExam('exam-uuid-1', { readOnly: true })] }),
        ],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: { authorized: true, credit: 100, submittable: false },
      },
      {
        name: 'non-PT rule in Exam mode: denied',
        rules: [makeDefaultRule()],
        authzMode: 'Exam',
        expect: {
          authorized: false,
          submittable: false,
          visibility: { showQuestions: false, showScore: false },
          afterCompleteVisibility: { showQuestions: false, showScore: false },
        },
      },
      {
        name: 'readOnly flag from matched exam when multiple exams configured',
        rules: [
          makeDefaultRule(
            {},
            {
              prairieTestExams: [ptExam('exam-uuid-1'), ptExam('exam-uuid-3', { readOnly: true })],
            },
          ),
        ],
        authzMode: 'Exam',
        reservations: [{ examUuid: 'exam-uuid-3', accessEnd: new Date('2025-03-15T16:00:00Z') }],
        expect: { authorized: true, credit: 100, submittable: false },
      },
      {
        name: 'PT reservation overrides date-control credit with 100%',
        rules: [
          makeDefaultRule(
            {
              dateControl: {
                release: { date: '2025-01-01T00:00:00Z' },
                due: { date: '2025-02-01T00:00:00Z' },
                afterLastDeadline: { credit: 50, allowSubmissions: true },
              },
            },
            { prairieTestExams: [ptExam('exam-uuid-1')] },
          ),
        ],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: { authorized: true, credit: 100, submittable: true },
      },
      {
        name: 'Exam-mode grant ignores dateControl password and durationMinutes',
        rules: [
          makeDefaultRule(
            {
              dateControl: {
                release: { date: '2025-01-01T00:00:00Z' },
                due: { date: '2025-02-01T00:00:00Z' },
                durationMinutes: 60,
                password: 'secret',
              },
            },
            { prairieTestExams: [ptExam('exam-uuid-1')] },
          ),
        ],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: { authorized: true, submittable: true, password: null, timeLimitMin: null },
      },
      {
        name: 'readOnly exam: creditDateString is None',
        rules: [
          makeDefaultRule({}, { prairieTestExams: [ptExam('exam-uuid-1', { readOnly: true })] }),
        ],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: { authorized: true, credit: 100, submittable: false, creditDateString: 'None' },
      },
      {
        // The date-control timeline is irrelevant under a PT grant: the PT
        // reservation governs access, so the student popover shouldn't show
        // a date-control timeline at all.
        name: 'PT grant clears the date-control access timeline',
        rules: [
          makeDefaultRule(
            {
              dateControl: {
                release: { date: '2025-01-01T00:00:00Z' },
                due: { date: '2025-02-01T00:00:00Z' },
                afterLastDeadline: { credit: 50, allowSubmissions: true },
              },
            },
            { prairieTestExams: [ptExam('exam-uuid-1')] },
          ),
        ],
        authzMode: 'Exam',
        reservations: [validReservation],
        expect: { authorized: true, submittable: true, accessTimeline: [] },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });

    // See https://github.com/PrairieLearn/PrairieLearn/discussions/11308.
    // Students submit at home during the dateControl active window, retain
    // read-only access at home after the due date, and get a read-only view
    // during a PT reservation via a readOnly exam config.
    describe('cheat sheet hack workflow', () => {
      const cheatSheetRule = makeDefaultRule(
        {
          dateControl: {
            release: { date: '2025-02-01T00:00:00Z' },
            due: { date: '2025-03-01T00:00:00Z' },
            afterLastDeadline: { credit: 0, allowSubmissions: false },
          },
          afterComplete: {
            questions: { hidden: false },
            score: { hidden: false },
          },
        },
        // readOnly so students can't submit during the PT reservation.
        { prairieTestExams: [ptExam('exam-uuid-1', { readOnly: true })] },
      );

      it.each<ResolveCase>([
        {
          name: 'before release at home: denied',
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-01-15T00:00:00Z'),
          expect: { authorized: false, submittable: false, showBeforeRelease: false },
        },
        {
          name: 'release→due window at home: 100% active',
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-02-15T00:00:00Z'),
          expect: { authorized: true, submittable: true, credit: 100 },
        },
        {
          name: 'after due at home: review-only',
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-03-15T00:00:00Z'),
          expect: {
            authorized: true,
            submittable: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
        {
          name: 'Exam mode with readOnly reservation: review-only',
          rules: [cheatSheetRule],
          authzMode: 'Exam',
          date: new Date('2025-03-15T00:00:00Z'),
          reservations: [{ examUuid: 'exam-uuid-1', accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: {
            authorized: true,
            submittable: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
      ])('$name', (c) => {
        expect(runCase(c)).toMatchObject(c.expect);
      });
    });

    describe('after-complete visibility with PrairieTest', () => {
      const ptRes: PrairieTestReservation = {
        examUuid: 'pt-exam-1',
        accessEnd: new Date('2025-03-15T14:00:00Z'),
      };

      it.each<ResolveCase>([
        {
          name: 'active reservation, no PT-level afterComplete: everything visible',
          rules: [makeDefaultRule({}, { prairieTestExams: [ptExam('pt-exam-1')] })],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: true,
            visibility: { showQuestions: true, showScore: true },
          },
        },
        {
          name: 'active reservation, PT questions.hidden: questions hidden',
          rules: [
            makeDefaultRule(
              {},
              { prairieTestExams: [ptExam('pt-exam-1', { questionsHidden: true })] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: true,
            visibility: { showQuestions: false, showScore: true },
          },
        },
        {
          name: 'active reservation, PT questionsHidden+scoreHidden: both hidden',
          rules: [
            makeDefaultRule(
              {},
              {
                prairieTestExams: [
                  ptExam('pt-exam-1', { questionsHidden: true, scoreHidden: true }),
                ],
              },
            ),
          ],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: true,
            visibility: { showQuestions: false, showScore: false },
          },
        },
        {
          name: 'readOnly reservation: non-active grant, everything visible',
          rules: [
            makeDefaultRule({}, { prairieTestExams: [ptExam('pt-exam-1', { readOnly: true })] }),
          ],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
        {
          // During an active PT reservation, top-level afterComplete is ignored
          // in favor of the matched PT exam's config. This lets course authors
          // configure Exam-mode visibility and Public-mode visibility independently.
          name: 'top-level afterComplete ignored during active PT grant',
          rules: [
            makeDefaultRule(
              { afterComplete: { questions: { hidden: true }, score: { hidden: true } } },
              { prairieTestExams: [ptExam('pt-exam-1')] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: true,
            visibility: { showQuestions: true, showScore: true },
          },
        },
        {
          name: 'top-level afterComplete ignored during readOnly PT grant',
          rules: [
            makeDefaultRule(
              { afterComplete: { questions: { hidden: true }, score: { hidden: true } } },
              { prairieTestExams: [ptExam('pt-exam-1', { readOnly: true })] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [ptRes],
          expect: {
            authorized: true,
            submittable: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
      ])('$name', (c) => {
        expect(runCase(c)).toMatchObject(c.expect);
      });

      // Use case: real-time grading disabled during the exam. In Exam mode
      // after "finish", students see nothing. After all reservations have
      // ended, work stays hidden at home until a scheduled at-home visible
      // date; on that date the gradebook reveals questions and scores so
      // students can review at home.
      describe('deferred at-home release', () => {
        const atHomeVisibleDate = '2025-04-01T00:00:00Z';
        const ruleWithDeferredRelease = makeDefaultRule(
          {
            afterComplete: {
              questions: { hidden: true, visibleFromDate: atHomeVisibleDate },
              score: { hidden: true, visibleFromDate: atHomeVisibleDate },
            },
          },
          {
            prairieTestExams: [ptExam('pt-exam-1', { questionsHidden: true, scoreHidden: true })],
          },
        );

        it.each<ResolveCase>([
          {
            name: 'Exam mode during reservation: hides both',
            rules: [ruleWithDeferredRelease],
            authzMode: 'Exam',
            reservations: [ptRes],
            expect: {
              authorized: true,
              submittable: true,
              visibility: { showQuestions: false, showScore: false },
            },
          },
          {
            // PT-gated rule with no DC has no at-home access path, so access is
            // denied; afterComplete still propagates for the gradebook.
            name: 'at home before visible date: still hidden, denied',
            rules: [ruleWithDeferredRelease],
            authzMode: 'Public',
            date: new Date('2025-03-20T00:00:00Z'),
            reservations: [],
            expect: {
              authorized: false,
              submittable: false,
              visibility: { showQuestions: false, showScore: false },
            },
          },
          {
            // Top-level afterComplete visibility has unlocked, so the resolver
            // grants a review-only path: authorized=true lets the middleware
            // serve the page, active=false prevents submissions.
            name: 'at home after visible date: review-only',
            rules: [ruleWithDeferredRelease],
            authzMode: 'Public',
            date: new Date('2025-04-02T00:00:00Z'),
            reservations: [],
            expect: {
              authorized: true,
              submittable: false,
              credit: 0,
              creditDateString: 'None',
              password: null,
              timeLimitMin: null,
              examAccessEnd: null,
              showBeforeRelease: false,
              nextActiveDate: null,
              visibility: { showQuestions: true, showScore: true },
            },
          },
          {
            // Regression test for this issue:
            // https://github.com/PrairieLearn/PrairieLearn/issues/12579
            //
            // After a student finishes a PT exam and the reservation is explicitly
            // ended, PrairieLearn keeps them in Exam mode for a short grace period
            // (~30 min). There is no active matching reservation, so access is
            // denied, but the gradebook still renders the completed assessment row.
            // The deny path must keep completed-work visibility hidden instead of
            // falling back to defaults that would reveal the score for that
            // just-finished assessment.
            name: 'grace-period Exam mode after reservation ended: hides review visibility',
            rules: [ruleWithDeferredRelease],
            authzMode: 'Exam',
            date: new Date('2025-03-15T14:15:00Z'),
            reservations: [],
            expect: {
              authorized: false,
              submittable: false,
              visibility: { showQuestions: false, showScore: false },
              afterCompleteVisibility: { showQuestions: false, showScore: false },
            },
          },
        ])('$name', (c) => {
          expect(runCase(c)).toMatchObject(c.expect);
        });
      });

      // Use case: real-time grading enabled during the exam. Students click
      // "finish" in Exam mode and review feedback/scores for the rest of
      // the reservation. Once they leave Exam mode, the gradebook hides both
      // and they can never see their work again.
      describe('real-time grading during exam, hidden after', () => {
        const rule = makeDefaultRule(
          { afterComplete: { questions: { hidden: true }, score: { hidden: true } } },
          { prairieTestExams: [ptExam('pt-exam-1')] },
        );

        it.each<ResolveCase>([
          {
            name: 'Exam mode after finish: both visible',
            rules: [rule],
            authzMode: 'Exam',
            reservations: [ptRes],
            expect: {
              authorized: true,
              submittable: true,
              visibility: { showQuestions: true, showScore: true },
            },
          },
          {
            // PT-gated rule with no DC has no at-home access path; afterComplete
            // still propagates.
            name: 'at home after reservation ends: both hidden, denied',
            rules: [rule],
            authzMode: 'Public',
            reservations: [],
            expect: {
              authorized: false,
              submittable: false,
              visibility: { showQuestions: false, showScore: false },
            },
          },
        ])('$name', (c) => {
          expect(runCase(c)).toMatchObject(c.expect);
        });
      });

      describe('PT-gated secure review session', () => {
        it.each<ResolveCase>([
          {
            name: 'readOnly reservation allows reviewing closed assessment',
            rules: [
              makeDefaultRule({}, { prairieTestExams: [ptExam('pt-exam-1', { readOnly: true })] }),
            ],
            authzMode: 'Exam',
            reservations: [ptRes],
            expect: {
              authorized: true,
              submittable: false,
              visibility: { showQuestions: true, showScore: true },
            },
          },
          {
            // PT-gated rule with no dateControl has no at-home access path, so
            // access is denied; afterComplete still propagates for the gradebook.
            name: 'no DC, Public mode without reservation: denied; afterComplete propagates',
            rules: [
              makeDefaultRule(
                { afterComplete: { questions: { hidden: true }, score: { hidden: true } } },
                { prairieTestExams: [ptExam('pt-exam-1', { readOnly: true })] },
              ),
            ],
            authzMode: 'Public',
            reservations: [],
            expect: {
              authorized: false,
              submittable: false,
              visibility: { showQuestions: false, showScore: false },
              showBeforeRelease: false,
              examAccessEnd: null,
            },
          },
        ])('$name', (c) => {
          expect(runCase(c)).toMatchObject(c.expect);
        });
      });
    });

    describe('showBeforeRelease with PrairieTest', () => {
      const ptExam1 = ptExam('pt-exam-1');

      it.each<ResolveCase>([
        {
          name: 'Public mode with beforeRelease.listed: lists as coming soon',
          rules: [
            makeDefaultRule({ beforeRelease: { listed: true } }, { prairieTestExams: [ptExam1] }),
          ],
          expect: {
            authorized: false,
            showBeforeRelease: true,
            submittable: false,
            credit: 0,
          },
        },
        {
          name: 'Exam mode without matching reservation: not listed, not authorized',
          rules: [
            makeDefaultRule({ beforeRelease: { listed: true } }, { prairieTestExams: [ptExam1] }),
          ],
          authzMode: 'Exam',
          reservations: [{ examUuid: 'other-exam', accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: { authorized: false, showBeforeRelease: false, submittable: false },
        },
        {
          // Public mode: DC path applies, past-due is shown as closed not "before
          // release".
          name: 'past due in Public mode: complete review-only (no afterLastDeadline)',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                dateControl: {
                  release: { date: '2025-01-01T00:00:00Z' },
                  due: { date: '2025-02-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Public',
          expect: {
            authorized: true,
            submittable: false,
            credit: 0,
            complete: true,
            showBeforeRelease: false,
          },
        },
        {
          name: 'past due in Exam mode without matching reservation: denied',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                dateControl: {
                  release: { date: '2025-01-01T00:00:00Z' },
                  due: { date: '2025-02-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [{ examUuid: 'wrong-exam', accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: { authorized: false, submittable: false, showBeforeRelease: false },
        },
        {
          name: 'PT reservation grants access even when past due',
          rules: [
            makeDefaultRule(
              {
                dateControl: {
                  release: { date: '2025-01-01T00:00:00Z' },
                  due: { date: '2025-02-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [{ examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: { authorized: true, credit: 100, submittable: true, showBeforeRelease: false },
        },
        {
          name: 'PT reservation grants access even before release',
          rules: [
            makeDefaultRule(
              {
                dateControl: {
                  release: { date: '2025-06-01T00:00:00Z' },
                  due: { date: '2025-07-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Exam',
          reservations: [{ examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: { authorized: true, credit: 100, submittable: true, showBeforeRelease: false },
        },
        {
          // Public mode with a future release and beforeRelease.listed: PT
          // gating is irrelevant because PT only applies in Exam mode.
          name: 'PT-gated, Public mode, future release: lists as coming soon',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                dateControl: {
                  release: { date: '2025-04-01T00:00:00Z' },
                  due: { date: '2025-05-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Public',
          expect: { authorized: false, showBeforeRelease: true, submittable: false, credit: 0 },
        },
        {
          // A granted student has real access and shouldn't also be shown the
          // "coming soon" listing. This matters when no release is configured —
          // otherwise the grant branch zeroing creditResult.beforeRelease would
          // already make showBeforeRelease false via the release-date clause.
          name: 'active PT grant suppresses showBeforeRelease',
          rules: [
            makeDefaultRule({ beforeRelease: { listed: true } }, { prairieTestExams: [ptExam1] }),
          ],
          authzMode: 'Exam',
          reservations: [{ examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') }],
          expect: {
            authorized: true,
            submittable: true,
            credit: 100,
            showBeforeRelease: false,
          },
        },
        {
          // In Exam mode, PT is the only access path; no matching reservation
          // → denied even during DC open window.
          name: 'Exam mode, DC open, no matching reservation: denied',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                dateControl: {
                  release: { date: '2025-01-01T00:00:00Z' },
                  due: { date: '2025-06-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Exam',
          expect: {
            authorized: false,
            showBeforeRelease: false,
            submittable: false,
            visibility: { showQuestions: false, showScore: false },
          },
        },
        {
          // Review-only access wins over `beforeRelease.listed`: a student
          // who finished the exam should be able to review their work even
          // if the listing flag was left set on the rule.
          name: 'PT review-only wins over beforeRelease.listed when visibility is unlocked',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                afterComplete: { questions: { hidden: false }, score: { hidden: false } },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Public',
          reservations: [],
          expect: {
            authorized: true,
            submittable: false,
            showBeforeRelease: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
        {
          // Same priority via the deferred-release pattern: instructor uses
          // `visibleFromDate` to schedule at-home review and leaves
          // `beforeRelease.listed` set. After the visible date, students
          // get review-only access, not the coming-soon listing.
          name: 'visibleFromDate unlock + beforeRelease.listed: review-only wins after date',
          rules: [
            makeDefaultRule(
              {
                beforeRelease: { listed: true },
                afterComplete: {
                  questions: { hidden: true, visibleFromDate: '2025-04-01T00:00:00Z' },
                  score: { hidden: true, visibleFromDate: '2025-04-01T00:00:00Z' },
                },
              },
              { prairieTestExams: [ptExam1] },
            ),
          ],
          authzMode: 'Public',
          date: new Date('2025-04-02T00:00:00Z'),
          reservations: [],
          expect: {
            authorized: true,
            submittable: false,
            showBeforeRelease: false,
            visibility: { showQuestions: true, showScore: true },
          },
        },
      ])('$name', (c) => {
        expect(runCase(c)).toMatchObject(c.expect);
      });
    });
  });

  describe('time limit computation', () => {
    it.each<ResolveCase>([
      {
        name: 'returns durationMinutes when no nearby deadline',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
              durationMinutes: 60,
            },
          }),
        ],
        expect: { authorized: true, submittable: true, timeLimitMin: 60 },
      },
      {
        // 10 minutes until the only deadline, minus 31 seconds = 569s / 60 = 9.48 → 9
        name: 'caps time limit by seconds until the last submittable deadline',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T11:50:00Z'),
        expect: { authorized: true, submittable: true, timeLimitMin: 9 },
      },
      {
        name: 'returns null in Exam mode',
        rules: [
          makeDefaultRule(
            {
              dateControl: {
                release: { date: '2025-01-01T00:00:00Z' },
                due: { date: '2025-04-01T00:00:00Z' },
                durationMinutes: 60,
              },
            },
            { prairieTestExams: [ptExam('exam-uuid-1')] },
          ),
        ],
        authzMode: 'Exam',
        reservations: [{ examUuid: 'exam-uuid-1', accessEnd: new Date('2025-03-15T14:00:00Z') }],
        expect: { authorized: true, submittable: true, timeLimitMin: null },
      },
      {
        // 30m30s until deadline minus 31 seconds = 1799s / 60 = 29.983 → rounds to 30
        name: 'rounds capped time limit to nearest minute',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T11:29:30Z'),
        expect: { authorized: true, submittable: true, timeLimitMin: 30 },
      },
      {
        // 20 seconds until deadline minus 31 seconds → clamp to 0
        name: 'clamps to zero when deadline is less than 31 seconds away',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:20Z' },
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: true, submittable: true, timeLimitMin: 0 },
      },
      {
        name: 'returns null when no durationMinutes',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
        ],
        expect: { authorized: true, submittable: true, timeLimitMin: null },
      },
      {
        // Time limit spans submittable access windows: a student starting 10
        // minutes before the due date keeps the full 60-minute clock, with
        // 100% credit for the first 10 minutes (until the due date) and 80%
        // for the remaining 50 minutes (until the late deadline 7 days out).
        name: 'spans into late window: full duration, 100% credit currently',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              lateDeadlines: [{ date: '2025-03-22T12:00:00Z', credit: 80 }],
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T11:50:00Z'),
        expect: { authorized: true, submittable: true, credit: 100, timeLimitMin: 60 },
      },
      {
        // Once inside the late window, the cap is the late deadline. With 6+
        // days of headroom, the full 60-minute duration is available at 80%.
        name: 'late window: full duration available, capped by late deadline',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              lateDeadlines: [{ date: '2025-03-22T12:00:00Z', credit: 80 }],
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-16T12:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 80, timeLimitMin: 60 },
      },
      {
        // Approaching the final late deadline, the cap shrinks to the time
        // remaining in the late window (30 min minus 31s legacy buffer = 29).
        name: 'caps at late deadline as it approaches',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              lateDeadlines: [{ date: '2025-03-22T12:00:00Z', credit: 80 }],
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-22T11:30:00Z'),
        expect: { authorized: true, submittable: true, credit: 80, timeLimitMin: 29 },
      },
      {
        // afterLastDeadline allowing submissions has no end, so the duration
        // runs uncapped against the configured 60 min: 10 min at 100% credit
        // before the due date, then 50 min at 25% credit afterwards.
        name: 'spans through afterLastDeadline when submissions are allowed',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              afterLastDeadline: { credit: 25, allowSubmissions: true },
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T11:50:00Z'),
        expect: { authorized: true, submittable: true, credit: 100, timeLimitMin: 60 },
      },
      {
        // Same rule, started after the due date: full duration available at
        // the afterLastDeadline credit (25%).
        name: 'after due in afterLastDeadline: full duration at reduced credit',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-03-15T12:00:00Z' },
              afterLastDeadline: { credit: 25, allowSubmissions: true },
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-16T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 25, timeLimitMin: 60 },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('after-complete visibility (top-level)', () => {
    const completedRule = (rule: AccessControlJson = {}) =>
      makeDefaultRule({
        ...rule,
        dateControl: {
          release: { date: '2025-03-01T00:00:00Z' },
          // The `baseInput` date that `makeDefaultRule` will apply is after this due date.
          due: { date: '2025-03-10T00:00:00Z' },
          afterLastDeadline: { allowSubmissions: false },
          ...rule.dateControl,
        },
      });

    it.each<ResolveCase>([
      {
        name: 'no afterComplete: defaults to questions hidden and score visible',
        rules: [completedRule()],
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: true },
        },
      },
      {
        name: 'omitted afterLastDeadline: afterComplete visibility is applied',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
            },
            afterComplete: { questions: { hidden: false } },
          }),
        ],
        expect: {
          authorized: true,
          submittable: false,
          complete: true,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'questions.hidden=false: questions visible',
        rules: [completedRule({ afterComplete: { questions: { hidden: false } } })],
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'questions.hidden=true: questions hidden',
        rules: [completedRule({ afterComplete: { questions: { hidden: true } } })],
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: true },
        },
      },
      {
        name: 'questions.visibleFromDate elapsed: questions visible',
        rules: [
          completedRule({
            afterComplete: {
              questions: { hidden: true, visibleFromDate: '2025-03-10T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'questions.visibleUntilDate elapsed: questions hidden again',
        rules: [
          completedRule({
            afterComplete: {
              questions: {
                hidden: true,
                visibleFromDate: '2025-03-10T00:00:00Z',
                visibleUntilDate: '2025-03-14T00:00:00Z',
              },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: true },
        },
      },
      {
        name: 'score.hidden=true: score hidden',
        rules: [completedRule({ afterComplete: { score: { hidden: true } } })],
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: false },
        },
      },
      {
        name: 'score.visibleFromDate elapsed: score visible',
        rules: [
          completedRule({
            afterComplete: {
              score: { hidden: true, visibleFromDate: '2025-03-10T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: true },
        },
      },
      {
        // Per-rule validation forbids `score.hidden: true` alongside
        // `questions.hidden: false` on a single rule, but merging is independent
        // per sub-object: a default rule that only sets `questions` combined with
        // an override that only sets `score` can yield the forbidden pair.
        // The resolver must clamp to "hide questions" rather than show answers
        // without a score.
        name: 'merged default + override produces hidden-score: questions also hidden',
        rules: [
          completedRule({ afterComplete: { questions: { hidden: false } } }),
          makeOverrideRule(
            1,
            { afterComplete: { score: { hidden: true } } },
            { enrollmentIds: [defaultEnrollment.enrollmentId] },
          ),
        ],
        expect: {
          authorized: true,
          submittable: false,
          visibility: { showQuestions: false, showScore: false },
        },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });

    it.each<ResolveCase>([
      {
        name: 'active before due: afterComplete score policy is not applied yet',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-20T00:00:00Z' },
            },
            afterComplete: { score: { hidden: true } },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: true,
          complete: false,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'late deadline window: afterComplete score policy is not applied yet',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              lateDeadlines: [{ date: '2025-03-20T00:00:00Z', credit: 80 }],
              afterLastDeadline: { allowSubmissions: false },
            },
            afterComplete: { score: { hidden: true } },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: true,
          complete: false,
          visibility: { showQuestions: true, showScore: true },
        },
      },
      {
        name: 'after last late deadline: afterComplete score policy is applied',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              lateDeadlines: [{ date: '2025-03-20T00:00:00Z', credit: 80 }],
              afterLastDeadline: { allowSubmissions: false },
            },
            afterComplete: { score: { hidden: true } },
          }),
        ],
        date: new Date('2025-03-21T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: false,
          complete: true,
          visibility: { showQuestions: false, showScore: false },
        },
      },
      {
        name: 'afterLastDeadline submissions allowed: afterComplete score policy still applies',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-10T00:00:00Z' },
              afterLastDeadline: { allowSubmissions: true, credit: 10 },
            },
            afterComplete: { score: { hidden: true } },
          }),
        ],
        date: new Date('2025-03-21T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: true,
          complete: true,
          visibility: { showQuestions: false, showScore: false },
        },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('credit date string formatting', () => {
    it.each<ResolveCase>([
      {
        name: 'shows credit percentage and deadline',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: {
          authorized: true,
          submittable: true,
          creditDateString: expect.stringMatching(/^100% until /),
        },
      },
      {
        name: 'shows None when no dateControl configured',
        expect: { authorized: false, submittable: false, creditDateString: 'None' },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('timeline edge cases from cascading', () => {
    it.each<ResolveCase>([
      {
        name: 'due before release blocks access',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-15T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-03-01T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-03-20T00:00:00Z'),
        expect: { authorized: false, credit: 0, submittable: false },
      },
      {
        name: 'early deadline before release is ignored',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-03T00:00:00Z' },
              earlyDeadlines: [
                { date: '2025-03-01T00:00:00Z', credit: 120 },
                { date: '2025-03-10T00:00:00Z', credit: 110 },
              ],
              due: { date: '2025-03-20T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-05T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 110 },
      },
      {
        name: 'late deadline before release is ignored',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-15T00:00:00Z' },
              due: { date: '2025-03-20T00:00:00Z' },
              lateDeadlines: [
                { date: '2025-03-10T00:00:00Z', credit: 80 },
                { date: '2025-03-25T00:00:00Z', credit: 50 },
              ],
            },
          }),
        ],
        date: new Date('2025-03-22T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 50 },
      },
      {
        // Early deadlines are after due date (Feb 15), so ignored
        name: 'early deadlines after cascaded due date are filtered out',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              earlyDeadlines: [
                { date: '2025-03-01T00:00:00Z', credit: 120 },
                { date: '2025-03-02T00:00:00Z', credit: 110 },
              ],
              due: { date: '2025-03-15T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-02-15T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-01-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 100 },
      },
      {
        // Late deadline March 25 < due date March 30, so ignored → past due → complete review-only.
        name: 'late deadline before cascaded due date is ignored',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-03-20T00:00:00Z' },
              lateDeadlines: [{ date: '2025-03-25T00:00:00Z', credit: 80 }],
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-03-30T00:00:00Z' } } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-04-01T00:00:00Z'),
        expect: { authorized: true, submittable: false, credit: 0, complete: true },
      },
      {
        name: 'afterLastDeadline ignored when there are no deadlines',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: null },
              afterLastDeadline: { credit: 50, allowSubmissions: true },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, credit: 100, submittable: true },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });
  });

  describe('custom due credit', () => {
    it.each<ResolveCase>([
      {
        name: 'applies custom due credit before due date',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z', credit: 80 },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: true, credit: 80, submittable: true },
      },
      {
        // Raw late credits [90, 70] with due credit 80 clamp to effective [80, 70]
        name: 'caps late deadlines at custom due credit (between due and first late)',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z', credit: 80 },
              lateDeadlines: [
                { date: '2025-04-15T00:00:00Z', credit: 90 },
                { date: '2025-04-30T00:00:00Z', credit: 70 },
              ],
            },
          }),
        ],
        date: new Date('2025-04-10T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 80 },
      },
      {
        name: 'applies second late deadline below custom due credit unchanged',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z', credit: 80 },
              lateDeadlines: [
                { date: '2025-04-15T00:00:00Z', credit: 90 },
                { date: '2025-04-30T00:00:00Z', credit: 70 },
              ],
            },
          }),
        ],
        date: new Date('2025-04-20T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 70 },
      },
      {
        // Raw early credits [130, 110] with due credit 120 clamp to [130, 120]
        name: 'floors early deadlines at custom due credit when above 100',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z', credit: 120 },
              earlyDeadlines: [
                { date: '2025-02-01T00:00:00Z', credit: 130 },
                { date: '2025-03-01T00:00:00Z', credit: 110 },
              ],
            },
          }),
        ],
        date: new Date('2025-02-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 120 },
      },
      {
        // No afterLastDeadline configured → no submissions after the final deadline.
        name: 'complete review-only after due date with no late deadlines',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z', credit: 80 },
            },
          }),
        ],
        date: new Date('2025-04-05T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: false, complete: true },
      },
      {
        name: 'defaults due credit to 100 when credit field is omitted',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
        expect: { authorized: true, submittable: true, credit: 100 },
      },
      {
        name: 'applies custom due credit indefinitely when due date is null',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: null, credit: 50 },
            },
          }),
        ],
        date: new Date('2030-01-01T00:00:00Z'),
        expect: { authorized: true, credit: 50, submittable: true, creditDateString: '50%' },
      },
      {
        // E.g., Practice assessment: 0% credit submissions allowed indefinitely
        name: '0 credit with null due date: active, creditDateString=None',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-03-01T00:00:00Z' },
              due: { date: null, credit: 0 },
            },
          }),
        ],
        date: new Date('2030-01-01T00:00:00Z'),
        expect: { authorized: true, credit: 0, submittable: true, creditDateString: 'None' },
      },
      {
        name: 'null due date shadows afterLastDeadline (with early deadlines)',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: null },
              earlyDeadlines: [{ date: '2025-02-01T00:00:00Z', credit: 120 }],
              afterLastDeadline: { credit: 50, allowSubmissions: true },
            },
          }),
        ],
        date: new Date('2030-01-01T00:00:00Z'),
        expect: { authorized: true, credit: 100, submittable: true },
      },
    ])('$name', (c) => {
      expect(runCase(c)).toMatchObject(c.expect);
    });

    // Walks one rule across two dates with creditDateString assertions; kept
    // as a single it() since the two phases share configuration.
    it('honors early deadlines with null due date, then applies default credit indefinitely', () => {
      const rules = [
        makeDefaultRule({
          dateControl: {
            release: { date: '2025-01-01T00:00:00Z' },
            due: { date: null },
            earlyDeadlines: [{ date: '2025-02-01T00:00:00Z', credit: 120 }],
          },
        }),
      ];
      const before = resolveAccessControl({
        ...baseInput,
        rules,
        date: new Date('2025-01-15T00:00:00Z'),
      });
      expect(before).toMatchObject({ credit: 120, submittable: true });
      expect(before.creditDateString).toMatch(/^120% until /);

      const after = resolveAccessControl({
        ...baseInput,
        rules,
        date: new Date('2030-01-01T00:00:00Z'),
      });
      expect(after).toMatchObject({ credit: 100, submittable: true, creditDateString: '100%' });
    });
  });

  // Regression: deny / coming-soon returns previously dropped the precomputed
  // `accessTimeline` by spreading `UNAUTHORIZED_RESULT` (whose timeline is `[]`)
  // without re-spreading the timeline. The student popover then rendered an
  // empty schedule on pre-release and Exam-mode-deny pages.
  describe('accessTimeline preservation on deny returns', () => {
    const dcRule = makeDefaultRule({
      dateControl: {
        release: { date: '2025-04-01T00:00:00Z' },
        due: { date: '2025-05-01T00:00:00Z' },
      },
    });

    it('preserves accessTimeline on pre-release deny', () => {
      const result = runCase({
        name: 'pre-release deny',
        rules: [dcRule],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: false, submittable: false },
      });
      expect(result.authorized).toBe(false);
      expect(result.accessTimeline.length).toBeGreaterThan(0);
      expect(result.accessTimeline.find((e) => e.current)).toMatchObject({
        startDate: null,
        endDate: new Date('2025-04-01T00:00:00Z'),
      });
    });

    it('preserves accessTimeline on coming-soon (beforeRelease.listed) return', () => {
      const result = runCase({
        name: 'coming-soon',
        rules: [
          makeDefaultRule({
            beforeRelease: { listed: true },
            dateControl: {
              release: { date: '2025-04-01T00:00:00Z' },
              due: { date: '2025-05-01T00:00:00Z' },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        expect: { authorized: false, submittable: false },
      });
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.accessTimeline.length).toBeGreaterThan(0);
      expect(result.accessTimeline.find((e) => e.current)).toMatchObject({
        startDate: null,
        endDate: new Date('2025-04-01T00:00:00Z'),
      });
    });

    it('suppresses accessTimeline on Exam-mode deny without matching reservation', () => {
      const result = runCase({
        name: 'Exam-mode deny',
        rules: [
          makeDefaultRule(
            {
              dateControl: {
                release: { date: '2025-04-01T00:00:00Z' },
                due: { date: '2025-05-01T00:00:00Z' },
              },
            },
            { prairieTestExams: [ptExam('exam-uuid-1')] },
          ),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
        authzMode: 'Exam',
        reservations: [],
        expect: { authorized: false, submittable: false },
      });
      expect(result.authorized).toBe(false);
      expect(result.accessTimeline).toEqual([]);
    });
  });

  // Validation only models self-or-default cascade (validation.ts), so a
  // student matching multiple student_label overrides can produce a merged
  // dateControl that the validator never saw — e.g., one override sets a low
  // late-deadline credit and a second sets a higher afterLastDeadline credit.
  // buildAccessTimeline floors each post-release segment's credit to its
  // predecessor as a backstop. Tests pin the full timeline so the post-merge
  // shape is visible and structural details (dates, current, submittable)
  // are regression-checked alongside the credit invariant.
  describe('multi-override stacks produce non-increasing accessTimeline', () => {
    it('clamps afterLastDeadline credit when one override adds it above another override-supplied late deadline', () => {
      // Without the cross-segment clamp the timeline would climb 50 → 80 in
      // the trailing segment.
      const result = runCase({
        name: 'late from one override + higher afterLast from another',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            {
              dateControl: { lateDeadlines: [{ date: '2025-04-08T00:00:00Z', credit: 50 }] },
            },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            1,
            {
              dateControl: { afterLastDeadline: { allowSubmissions: true, credit: 80 } },
            },
            { targetType: 'student_label', studentLabelIds: ['label-2'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1', 'label-2'] },
        date: new Date('2025-04-10T00:00:00Z'),
        expect: { authorized: true, submittable: true },
      });
      expect(result.accessTimeline).toEqual([
        {
          kind: 'beforeRelease',
          credit: 0,
          startDate: null,
          endDate: new Date('2025-01-01T00:00:00Z'),
          current: false,
          submittable: false,
        },
        {
          kind: 'deadline',
          credit: 100,
          startDate: new Date('2025-01-01T00:00:00Z'),
          endDate: new Date('2025-04-01T00:00:00Z'),
          current: false,
          submittable: true,
        },
        {
          kind: 'deadline',
          credit: 50,
          startDate: new Date('2025-04-01T00:00:00Z'),
          endDate: new Date('2025-04-08T00:00:00Z'),
          current: false,
          submittable: true,
        },
        {
          kind: 'afterLastDeadline',
          credit: 50,
          startDate: new Date('2025-04-08T00:00:00Z'),
          endDate: null,
          current: true,
          submittable: true,
        },
      ]);
    });

    it('clamps a higher late-deadline credit when stacked over an override-supplied lower due credit', () => {
      // The per-deadline cap in buildDeadlines (Math.min against dueCredit)
      // handles this one — the late deadline's 90 is clipped to 60 before
      // the cross-segment clamp runs. Pin the timeline so that floor logic
      // doesn't silently regress.
      const result = runCase({
        name: 'low due credit from one override + higher late from another',
        rules: [
          makeDefaultRule({
            dateControl: {
              release: { date: '2025-01-01T00:00:00Z' },
              due: { date: '2025-04-01T00:00:00Z' },
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { due: { date: '2025-04-01T00:00:00Z', credit: 60 } } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            1,
            {
              dateControl: { lateDeadlines: [{ date: '2025-04-08T00:00:00Z', credit: 90 }] },
            },
            { targetType: 'student_label', studentLabelIds: ['label-2'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1', 'label-2'] },
        date: new Date('2025-04-05T00:00:00Z'),
        expect: { authorized: true, submittable: true },
      });
      expect(result.accessTimeline).toEqual([
        {
          kind: 'beforeRelease',
          credit: 0,
          startDate: null,
          endDate: new Date('2025-01-01T00:00:00Z'),
          current: false,
          submittable: false,
        },
        {
          kind: 'deadline',
          credit: 60,
          startDate: new Date('2025-01-01T00:00:00Z'),
          endDate: new Date('2025-04-01T00:00:00Z'),
          current: false,
          submittable: true,
        },
        {
          kind: 'deadline',
          credit: 60,
          startDate: new Date('2025-04-01T00:00:00Z'),
          endDate: new Date('2025-04-08T00:00:00Z'),
          current: true,
          submittable: true,
        },
        {
          kind: 'afterLastDeadline',
          credit: 0,
          startDate: new Date('2025-04-08T00:00:00Z'),
          endDate: null,
          current: false,
          submittable: false,
        },
      ]);
    });
  });
});

describe('mergeRules', () => {
  it('returns default rule when override is null', () => {
    const defaultRule = toRuntime({ beforeRelease: { listed: true } });
    expect(mergeRules(defaultRule, null)).toEqual(defaultRule);
  });

  it('does not mutate default rule', () => {
    const defaultRule = toRuntime({ dateControl: { due: { date: '2025-04-01T00:00:00Z' } } });
    mergeRules(defaultRule, toRuntime({ dateControl: { due: { date: '2025-05-01T00:00:00Z' } } }));
    expect(defaultRule.dateControl?.due?.date).toEqual(new Date('2025-04-01T00:00:00Z'));
  });

  interface MergeCase {
    name: string;
    defaultRule: AccessControlJson;
    override: AccessControlJson;
    check: (result: DefaultRuleBody) => void;
  }

  it.each<MergeCase>([
    {
      name: 'preserves default dateControl fields not in override',
      defaultRule: { dateControl: { due: { date: '2025-04-01T00:00:00Z' }, password: 'secret' } },
      override: { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
      check: (r) => {
        expect(r.dateControl?.due?.date).toEqual(new Date('2025-05-01T00:00:00Z'));
        expect(r.dateControl?.password).toBe('secret');
      },
    },
    {
      name: 'sets dateControl from override when default has none',
      defaultRule: {},
      override: { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
      check: (r) => expect(r.dateControl?.due?.date).toEqual(new Date('2025-05-01T00:00:00Z')),
    },
    {
      name: 'sets afterComplete from override when default has none',
      defaultRule: {},
      override: { afterComplete: { questions: { hidden: true } } },
      check: (r) => expect(r.afterComplete?.questions?.hidden).toBe(true),
    },
    {
      name: 'merges afterComplete fields',
      defaultRule: { afterComplete: { questions: { hidden: true }, score: { hidden: true } } },
      override: { afterComplete: { questions: { hidden: false } } },
      check: (r) => {
        expect(r.afterComplete?.questions?.hidden).toBe(false);
        expect(r.afterComplete?.score?.hidden).toBe(true);
      },
    },
    {
      name: 'override can clear default rule after-complete dates',
      defaultRule: {
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2025-06-01T00:00:00Z',
            visibleUntilDate: '2025-09-01T00:00:00Z',
          },
          score: { hidden: true, visibleFromDate: '2025-07-01T00:00:00Z' },
        },
      },
      override: {
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      },
      check: (r) => {
        expect(r.afterComplete?.questions?.hidden).toBe(true);
        expect(r.afterComplete?.questions?.visibleFromDate).toBeUndefined();
        expect(r.afterComplete?.questions?.visibleUntilDate).toBeUndefined();
        expect(r.afterComplete?.score?.hidden).toBe(true);
        expect(r.afterComplete?.score?.visibleFromDate).toBeUndefined();
      },
    },
    {
      name: 'inherits release from default when override does not set it',
      defaultRule: {
        dateControl: {
          release: { date: '2025-03-01T00:00:00Z' },
          due: { date: '2025-04-01T00:00:00Z' },
        },
      },
      override: { dateControl: { due: { date: '2025-05-01T00:00:00Z' } } },
      check: (r) => {
        expect(r.dateControl?.release?.date).toEqual(new Date('2025-03-01T00:00:00Z'));
        expect(r.dateControl?.due?.date).toEqual(new Date('2025-05-01T00:00:00Z'));
      },
    },
    {
      name: 'inherits afterComplete from default when override has none',
      defaultRule: { afterComplete: { questions: { hidden: true } } },
      override: {},
      check: (r) => expect(r.afterComplete?.questions?.hidden).toBe(true),
    },
    {
      name: 'inherits dateControl sub-fields from default when override has none',
      defaultRule: { dateControl: { due: { date: '2025-04-01T00:00:00Z' }, password: 'secret' } },
      override: {},
      check: (r) => {
        expect(r.dateControl?.due?.date).toEqual(new Date('2025-04-01T00:00:00Z'));
        expect(r.dateControl?.password).toBe('secret');
      },
    },
    {
      name: 'clears default afterLastDeadline credit when override disables submissions',
      defaultRule: { dateControl: { afterLastDeadline: { allowSubmissions: true, credit: 25 } } },
      override: { dateControl: { afterLastDeadline: { allowSubmissions: false } } },
      check: (r) => expect(r.dateControl?.afterLastDeadline).toEqual({ allowSubmissions: false }),
    },
  ])('$name', ({ defaultRule, override, check }) => {
    check(mergeRules(toRuntime(defaultRule), toRuntime(override)));
  });
});

describe('resolveVisibility', () => {
  const now = new Date('2025-03-15T12:00:00Z');

  it.each([
    {
      label: 'hide=false',
      hide: false,
      showAgain: undefined,
      hideAgain: undefined,
      expected: true,
    },
    {
      label: 'hide=undefined',
      hide: undefined,
      showAgain: undefined,
      hideAgain: undefined,
      expected: true,
    },
    {
      label: 'hide=true, no show-again',
      hide: true,
      showAgain: undefined,
      hideAgain: undefined,
      expected: false,
    },
    {
      label: 'hide=true, show-again=null',
      hide: true,
      showAgain: null,
      hideAgain: undefined,
      expected: false,
    },
    {
      label: 'past show-again date',
      hide: true,
      showAgain: '2025-03-10T00:00:00Z',
      hideAgain: undefined,
      expected: true,
    },
    {
      label: 'before show-again date',
      hide: true,
      showAgain: '2025-03-20T00:00:00Z',
      hideAgain: undefined,
      expected: false,
    },
    {
      label: 'past hide-again date',
      hide: true,
      showAgain: '2025-03-10T00:00:00Z',
      hideAgain: '2025-03-14T00:00:00Z',
      expected: false,
    },
    {
      label: 'past show-again, before hide-again',
      hide: true,
      showAgain: '2025-03-10T00:00:00Z',
      hideAgain: '2025-03-20T00:00:00Z',
      expected: true,
    },
  ] as const)('returns $expected when $label', ({ hide, showAgain, hideAgain, expected }) => {
    const showDate = showAgain != null ? new Date(showAgain) : showAgain;
    const hideDate = hideAgain != null ? new Date(hideAgain) : undefined;
    expect(resolveVisibility(hide, showDate, hideDate, now)).toBe(expected);
  });
});

describe('formatDateShort', () => {
  it.each([
    {
      name: 'America/Chicago timezone (12:00 UTC = 07:00 CDT)',
      date: '2025-03-15T12:00:00Z',
      timezone: 'America/Chicago',
      patterns: [/07:00/, /Sat/, /Mar/, /15/],
    },
    {
      name: 'UTC timezone',
      date: '2025-03-15T14:30:00Z',
      timezone: 'UTC',
      patterns: [/14:30/, /Sat/, /Mar/, /15/],
    },
  ])('$name', ({ date, timezone, patterns }) => {
    const result = formatDateShort(new Date(date), timezone);
    for (const pattern of patterns) {
      expect(result).toMatch(pattern);
    }
  });
});
