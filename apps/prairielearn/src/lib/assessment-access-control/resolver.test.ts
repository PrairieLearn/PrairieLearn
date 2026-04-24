import { describe, expect, it } from 'vitest';

import type { AccessControlJson } from '../../schemas/accessControl.js';

import {
  type AccessControlResolverInput,
  type AccessControlRuleInput,
  type EnrollmentContext,
  type PrairieTestReservation,
  type RuntimeAccessControl,
  cascadeOverrides,
  formatDateShort,
  mergeRules,
  resolveAccessControl,
  resolveVisibility,
} from './resolver.js';

/**
 * Converts an `AccessControlJson` (string dates) to `RuntimeAccessControl`
 * (Date dates) for use in tests.
 */
function toRuntime(json: AccessControlJson): RuntimeAccessControl {
  const { dateControl, afterComplete, ...rest } = json;
  const result: RuntimeAccessControl = { ...rest };
  if (dateControl) {
    const { releaseDate, dueDate, ...dcRest } = dateControl;
    result.dateControl = {
      ...dcRest,
      releaseDate: releaseDate !== undefined ? new Date(releaseDate) : undefined,
      dueDate: dueDate !== undefined ? (dueDate !== null ? new Date(dueDate) : null) : undefined,
    };
  }
  if (afterComplete) {
    result.afterComplete = {};
    if (afterComplete.questions) {
      const q = afterComplete.questions;
      result.afterComplete.questions = {
        hidden: q.hidden,
        visibleFromDate:
          q.visibleFromDate != null ? new Date(q.visibleFromDate) : q.visibleFromDate,
        visibleUntilDate:
          q.visibleUntilDate != null ? new Date(q.visibleUntilDate) : q.visibleUntilDate,
      };
    }
    if (afterComplete.score) {
      const s = afterComplete.score;
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
): AccessControlRuleInput['prairietestExams'][number] {
  return {
    uuid,
    readOnly: opts.readOnly ?? false,
    questionsHidden: opts.questionsHidden ?? false,
    scoreHidden: opts.scoreHidden ?? false,
  };
}

function makeMainRule(rule: AccessControlJson = {}): AccessControlRuleInput {
  return {
    rule: toRuntime(rule),
    number: 0,
    targetType: 'none',
    enrollmentIds: [],
    studentLabelIds: [],
    prairietestExams: [],
  };
}

function makeOverrideRule(
  number: number,
  rule: AccessControlJson,
  opts: Partial<Omit<AccessControlRuleInput, 'rule' | 'number'>> = {},
): AccessControlRuleInput {
  return {
    rule: toRuntime(rule),
    number,
    targetType: opts.targetType ?? 'enrollment',
    enrollmentIds: opts.enrollmentIds ?? [],
    studentLabelIds: opts.studentLabelIds ?? [],
    prairietestExams: opts.prairietestExams ?? [],
  };
}

const defaultEnrollment: EnrollmentContext = {
  enrollmentId: 'enroll-1',
  studentLabelIds: ['label-1'],
};

const baseInput: AccessControlResolverInput = {
  rules: [makeMainRule()],
  enrollment: defaultEnrollment,
  date: new Date('2025-03-15T12:00:00Z'),
  displayTimezone: 'America/Chicago',
  authzMode: 'Public',
  courseRole: 'None',
  courseInstanceRole: 'None',
  prairieTestReservations: [],
};

describe('resolveAccessControl', () => {
  describe('staff override', () => {
    const staffRoles: {
      label: string;
      courseRole: AccessControlResolverInput['courseRole'];
      courseInstanceRole: AccessControlResolverInput['courseInstanceRole'];
    }[] = [
      { label: 'Previewer course role', courseRole: 'Previewer', courseInstanceRole: 'None' },
      { label: 'Viewer course role', courseRole: 'Viewer', courseInstanceRole: 'None' },
      { label: 'Editor course role', courseRole: 'Editor', courseInstanceRole: 'None' },
      { label: 'Owner course role', courseRole: 'Owner', courseInstanceRole: 'None' },
      {
        label: 'Student Data Viewer instance role',
        courseRole: 'None',
        courseInstanceRole: 'Student Data Viewer',
      },
      {
        label: 'Student Data Editor instance role',
        courseRole: 'None',
        courseInstanceRole: 'Student Data Editor',
      },
    ];

    it.each(staffRoles)('grants full access for $label', ({ courseRole, courseInstanceRole }) => {
      const result = resolveAccessControl({ ...baseInput, courseRole, courseInstanceRole });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
      expect(result.creditDateString).toBe('100% (Staff override)');
      expect(result.timeLimitMin).toBeNull();
      expect(result.password).toBeNull();
    });

    it('does not grant staff override for None/None roles', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.authorized).toBe(true);
      expect(result.creditDateString).not.toBe('100% (Staff override)');
    });
  });

  describe('main rule only, no date control', () => {
    it('returns 0 credit when no dateControl configured', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('returns unauthorized when no main rule exists', () => {
      const result = resolveAccessControl({ ...baseInput, rules: [] });
      expect(result.authorized).toBe(false);
      expect(result.credit).toBe(0);
      expect(result.creditDateString).toBe('None');
    });
  });

  describe('main rule with date control', () => {
    it('denies access before release date when beforeRelease.listed is false', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-04-01T00:00:00Z',
              dueDate: '2025-05-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.authorized).toBe(false);
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('gives 100% credit between release and due date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-05-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
    });

    it.each([
      { date: '2025-03-12T00:00:00Z', expectedCredit: 80, label: 'first late period' },
      { date: '2025-03-17T00:00:00Z', expectedCredit: 50, label: 'second late period' },
    ])('gives $expectedCredit% credit in $label', ({ date, expectedCredit }) => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
              lateDeadlines: [
                { date: '2025-03-15T00:00:00Z', credit: 80 },
                { date: '2025-03-20T00:00:00Z', credit: 50 },
              ],
            },
          }),
        ],
        date: new Date(date),
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(expectedCredit);
      expect(result.active).toBe(true);
    });

    it('gives 0% credit after due date when afterLastDeadline is unset', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('handles late deadline with 0% credit', () => {
      const rule = makeMainRule({
        dateControl: {
          releaseDate: '2025-03-01T00:00:00Z',
          dueDate: '2025-03-10T00:00:00Z',
          lateDeadlines: [{ date: '2025-03-15T00:00:00Z', credit: 0 }],
        },
      });

      // Check during the late deadline period: should be active for no credit.
      // This is a regression test; we used to treat 0% credit as active:false.
      const result = resolveAccessControl({
        ...baseInput,
        rules: [rule],
        date: new Date('2025-03-12T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(true);

      // Check again after the late deadline.
      const resultAfter = resolveAccessControl({
        ...baseInput,
        rules: [rule],
        date: new Date('2025-03-16T00:00:00Z'),
      });
      expect(resultAfter.credit).toBe(0);
      expect(resultAfter.active).toBe(false);
    });

    it('uses afterLastDeadline credit when specified', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
              afterLastDeadline: { credit: 25, allowSubmissions: true },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(25);
      expect(result.active).toBe(true);
    });

    it('sets active=false when afterLastDeadline.allowSubmissions is false', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
              afterLastDeadline: { allowSubmissions: false },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('clears inherited afterLastDeadline credit when an override disables submissions', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
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
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('returns showBeforeRelease when set and before release', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            beforeRelease: { listed: true },
            dateControl: {
              releaseDate: '2025-04-01T00:00:00Z',
              dueDate: '2025-05-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      // `showBeforeRelease` is visibility-only; `authorized` stays false so the
      // student can see the "coming soon" listing but cannot open the URL.
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('does not set showBeforeRelease after release', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            beforeRelease: { listed: true },
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-05-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showBeforeRelease).toBe(false);
    });

    it('handles dateControl without releaseDate as no date-based access (0 credit)', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              dueDate: '2025-01-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('returns 100% credit when after release date and no deadlines', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-03-01T00:00:00Z' },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
    });
  });

  describe('early deadline bonus credit', () => {
    it.each([
      {
        label: 'before early deadline',
        date: '2025-03-05T00:00:00Z',
        expectedCredit: 110,
        earlyDate: '2025-03-10T00:00:00Z',
      },
      {
        label: 'after early deadline but before due date',
        date: '2025-03-12T00:00:00Z',
        expectedCredit: 100,
        earlyDate: '2025-03-10T00:00:00Z',
      },
      {
        label: 'before early deadline equal to due date',
        date: '2025-03-12T00:00:00Z',
        expectedCredit: 110,
        earlyDate: '2025-03-20T00:00:00Z',
      },
    ])('gives $expectedCredit% credit $label', ({ date, expectedCredit, earlyDate }) => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              earlyDeadlines: [{ date: earlyDate, credit: 110 }],
              dueDate: '2025-03-20T00:00:00Z',
            },
          }),
        ],
        date: new Date(date),
      });
      expect(result.credit).toBe(expectedCredit);
    });
  });

  describe('override matching by enrollment', () => {
    it('applies override when enrollment ID matches', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // Override extends due date, so at 2025-03-15 we should have 100% credit
      // with next deadline at 2025-05-01
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
    });

    it('does not apply override when enrollment ID does not match', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-03-10T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-other'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
        date: new Date('2025-03-15T00:00:00Z'),
      });
      // No override match, so main rule's due date (March 10) applies, we're past it
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('does not match enrollment override when student has no enrollment', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-03-10T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: null,
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
    });
  });

  describe('override matching by student label', () => {
    it('applies override when student label intersects', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1', 'label-2'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      expect(result.credit).toBe(100);
    });

    it('does not apply override when no label intersection', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-03-10T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-other'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
    });
  });

  describe('override type precedence', () => {
    it('enrollment override takes precedence over student_label override', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Enrollment override (due June 1 UTC = May 31 CDT) wins over student label (July 1)
      expect(result.creditDateString).toContain('May 31');
    });

    it('enrollment override wins even when student_label has lower number and is listed first', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            2,
            { dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Enrollment override should win despite student_label having lower number
      expect(result.creditDateString).toContain('May 31');
    });

    it('student_label override applies when no enrollment override matches', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-other'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Only student label override matches (due July 1 UTC = Jun 30 CDT)
      expect(result.creditDateString).toContain('Jun 30');
    });

    it('both enrollment overrides apply, later number wins', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
          makeOverrideRule(
            2,
            { dateControl: { dueDate: '2025-08-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // Both apply via cascading, second (number=2, due Aug 1 UTC = Jul 31 CDT) wins
      expect(result.creditDateString).toContain('Jul 31');
    });
  });

  describe('cascading overrides', () => {
    it('fields from different overrides merge together', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { releaseDate: '2025-01-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1'] },
          ),
          makeOverrideRule(
            1,
            { dateControl: { password: 'override-pw' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // student_label sets dueDate, enrollment sets password — both should apply
      expect(result.password).toBe('override-pw');
      // Due date from student_label override (June 1 UTC = May 31 CDT) should carry through
      expect(result.creditDateString).toContain('May 31');
    });
  });

  describe('field inheritance', () => {
    it('override only overrides explicitly-set fields', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-04-01T00:00:00Z',
              password: 'secret123',
            },
          }),
          makeOverrideRule(
            1,
            // Only override dueDate, password should inherit from main
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      expect(result.password).toBe('secret123');
      expect(result.credit).toBe(100);
    });

    it('override can override password', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-04-01T00:00:00Z',
              password: 'main-pass',
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { password: 'override-pass' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      expect(result.password).toBe('override-pass');
    });
  });

  describe('PrairieTest integration', () => {
    const prairieTestMainRule: AccessControlRuleInput = {
      rule: {},
      number: 0,
      targetType: 'none',
      enrollmentIds: [],
      studentLabelIds: [],
      prairietestExams: [ptExam('exam-uuid-1')],
    };

    const validReservation: PrairieTestReservation = {
      examUuid: 'exam-uuid-1',
      accessEnd: new Date('2025-03-15T14:00:00Z'),
    };

    it('grants access with valid exam reservation and full credit', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        prairieTestReservations: [validReservation],
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
      expect(result.examAccessEnd).toEqual(validReservation.accessEnd);
    });

    it('denies access in Public mode with no DC when PT-gated without matching reservation', () => {
      // PT reservations only apply in Exam mode, and a PT-gated rule with
      // no top-level dateControl has no at-home access path, so access is
      // denied.
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Public',
        prairieTestReservations: [validReservation],
      });
      expect(result.authorized).toBe(false);
      expect(result.active).toBe(false);
      expect(result.credit).toBe(0);
      expect(result.showClosedAssessment).toBe(false);
    });

    it('denies access when reservation UUID does not match', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        prairieTestReservations: [
          {
            examUuid: 'wrong-uuid',
            accessEnd: new Date('2025-03-15T14:00:00Z'),
          },
        ],
      });
      expect(result.authorized).toBe(false);
    });

    it('denies access when no reservation exists', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        prairieTestReservations: [],
      });
      expect(result.authorized).toBe(false);
    });

    it('grants access when matching reservation exists among multiple', () => {
      const wrongReservation: PrairieTestReservation = {
        examUuid: 'other-exam-uuid',
        accessEnd: new Date('2025-03-15T16:00:00Z'),
      };
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        prairieTestReservations: [wrongReservation, validReservation],
      });
      expect(result.authorized).toBe(true);
      expect(result.examAccessEnd).toEqual(validReservation.accessEnd);
    });

    it('sets active to false for readOnly exam', () => {
      const readOnlyRule: AccessControlRuleInput = {
        ...prairieTestMainRule,
        prairietestExams: [ptExam('exam-uuid-1', { readOnly: true })],
      };
      const result = resolveAccessControl({
        ...baseInput,
        rules: [readOnlyRule],
        authzMode: 'Exam',
        prairieTestReservations: [validReservation],
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(false);
    });

    it('denies access for non-exam rule when in PrairieTest exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule()],
        authzMode: 'Exam',
      });
      expect(result.authorized).toBe(false);
    });

    it('uses readOnly flag from matched exam when multiple exams are configured', () => {
      const multiExamRule: AccessControlRuleInput = {
        ...prairieTestMainRule,
        prairietestExams: [ptExam('exam-uuid-1'), ptExam('exam-uuid-3', { readOnly: true })],
      };
      const reservation: PrairieTestReservation = {
        examUuid: 'exam-uuid-3',
        accessEnd: new Date('2025-03-15T16:00:00Z'),
      };
      const result = resolveAccessControl({
        ...baseInput,
        rules: [multiExamRule],
        authzMode: 'Exam',
        prairieTestReservations: [reservation],
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(false);
    });

    it('overrides date-control credit with 100% when PT reservation matches', () => {
      const ruleWithDateControl: AccessControlRuleInput = {
        ...prairieTestMainRule,
        rule: toRuntime({
          dateControl: {
            releaseDate: '2025-01-01T00:00:00Z',
            dueDate: '2025-02-01T00:00:00Z',
            afterLastDeadline: { credit: 50, allowSubmissions: true },
          },
        }),
      };
      const result = resolveAccessControl({
        ...baseInput,
        rules: [ruleWithDateControl],
        authzMode: 'Exam',
        prairieTestReservations: [validReservation],
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
    });

    // See https://github.com/PrairieLearn/PrairieLearn/discussions/11308.
    // Students submit at home during the dateControl active window, retain
    // read-only access at home after the due date, and get a read-only view
    // during a PT reservation via a readOnly exam config.
    describe('cheat sheet hack workflow', () => {
      const cheatSheetRule: AccessControlRuleInput = {
        ...prairieTestMainRule,
        rule: toRuntime({
          dateControl: {
            releaseDate: '2025-02-01T00:00:00Z',
            dueDate: '2025-03-01T00:00:00Z',
            afterLastDeadline: { credit: 0, allowSubmissions: false },
          },
          afterComplete: {
            questions: { hidden: false },
            score: { hidden: false },
          },
        }),
        // readOnly so students can't submit during the PT reservation.
        prairietestExams: [ptExam('exam-uuid-1', { readOnly: true })],
      };

      it('denies access before release at home', () => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-01-15T00:00:00Z'),
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(false);
      });

      it('grants submission access during release→due window at home', () => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-02-15T00:00:00Z'),
        });
        expect(result.authorized).toBe(true);
        expect(result.active).toBe(true);
        expect(result.credit).toBe(100);
      });

      it('grants review-only access after due date at home', () => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [cheatSheetRule],
          authzMode: 'Public',
          date: new Date('2025-03-15T00:00:00Z'),
        });
        expect(result.authorized).toBe(true);
        expect(result.active).toBe(false);
        expect(result.showClosedAssessment).toBe(true);
      });

      it('grants review-only access in Exam mode with readOnly reservation', () => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [cheatSheetRule],
          authzMode: 'Exam',
          date: new Date('2025-03-15T00:00:00Z'),
          prairieTestReservations: [
            { examUuid: 'exam-uuid-1', accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(result.authorized).toBe(true);
        expect(result.active).toBe(false);
        expect(result.showClosedAssessment).toBe(true);
      });
    });

    describe('after-complete visibility with PrairieTest', () => {
      const validReservation: PrairieTestReservation = {
        examUuid: 'pt-exam-1',
        accessEnd: new Date('2025-03-15T14:00:00Z'),
      };

      describe('active PT reservation (PT-level afterComplete)', () => {
        it('defaults to everything visible when no PT-level afterComplete is configured', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [{ ...makeMainRule(), prairietestExams: [ptExam('pt-exam-1')] }],
            prairieTestReservations: [validReservation],
          });
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(true);
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        it('hides questions when PT-level questions.hidden is true', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              {
                ...makeMainRule(),
                prairietestExams: [ptExam('pt-exam-1', { questionsHidden: true })],
              },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        it('hides both when PT-level questions.hidden and score.hidden are true', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              {
                ...makeMainRule(),
                prairietestExams: [
                  ptExam('pt-exam-1', { questionsHidden: true, scoreHidden: true }),
                ],
              },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
        });
      });

      describe('readOnly PT reservation', () => {
        it('grants a non-active grant with everything visible', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              { ...makeMainRule(), prairietestExams: [ptExam('pt-exam-1', { readOnly: true })] },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });
      });

      describe('isolation: top-level afterComplete ignored during active/readOnly reservation', () => {
        // During an active PT reservation, top-level `afterComplete` is ignored
        // in favor of the matched PT exam's config. This lets course authors
        // configure Exam-mode visibility and Public-mode visibility independently.
        it('ignores top-level afterComplete during an active grant', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              {
                ...makeMainRule({
                  afterComplete: {
                    questions: { hidden: true },
                    score: { hidden: true },
                  },
                }),
                prairietestExams: [ptExam('pt-exam-1')],
              },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        it('ignores top-level afterComplete during a readOnly grant', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              {
                ...makeMainRule({
                  afterComplete: { questions: { hidden: true }, score: { hidden: true } },
                }),
                prairietestExams: [ptExam('pt-exam-1', { readOnly: true })],
              },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });
      });

      // Use case: real-time grading disabled during the exam. In Exam mode
      // after "finish", students see nothing. After all reservations have
      // ended, work stays hidden at home until a scheduled at-home visible
      // date; on that date the gradebook reveals questions and scores so
      // students can review at home.
      describe('deferred at-home release (grading disabled during exam)', () => {
        const atHomeVisibleDate = '2025-04-01T00:00:00Z';
        const ruleWithDeferredRelease = {
          ...makeMainRule({
            afterComplete: {
              questions: { hidden: true, visibleFromDate: atHomeVisibleDate },
              score: { hidden: true, visibleFromDate: atHomeVisibleDate },
            },
          }),
          prairietestExams: [ptExam('pt-exam-1', { questionsHidden: true, scoreHidden: true })],
        };

        it('hides both questions and score in Exam mode during the reservation', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [ruleWithDeferredRelease],
            prairieTestReservations: [validReservation],
          });
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(true);
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
        });

        it('still hides both at home after the reservation ends but before the at-home visible date', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Public',
            date: new Date('2025-03-20T00:00:00Z'),
            rules: [ruleWithDeferredRelease],
            prairieTestReservations: [],
          });
          // PT-gated rule with no DC has no at-home access path, so access is
          // denied; `afterComplete` still propagates for the gradebook.
          expect(result.authorized).toBe(false);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
        });

        it('reveals both at home after the at-home visible date', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Public',
            date: new Date('2025-04-02T00:00:00Z'),
            rules: [ruleWithDeferredRelease],
            prairieTestReservations: [],
          });
          // Top-level afterComplete visibility has unlocked, so the resolver
          // grants a review-only path: `authorized: true` lets the middleware
          // serve the assessment page, `active: false` prevents submissions.
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(false);
          expect(result.credit).toBe(0);
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        // Regression test for
        // https://github.com/PrairieLearn/PrairieLearn/issues/12579: after a
        // student finishes and their PT reservation ends, PrairieLearn keeps
        // them in Exam for a short grace period (~30 min). The rule-matching
        // path denies access (no active reservation), but the gradebook still
        // renders rows, so the deny path must propagate the configured
        // top-level `afterComplete` visibility rather than falling back to
        // defaults that would reveal scores while they should still be hidden.
        it('propagates afterComplete on deny during grace-period Exam mode', () => {
          const result = resolveAccessControl({
            ...baseInput,
            // The grace-period scenario is simulated by this specific pair:
            // `authzMode: 'Exam'` plus an empty `prairieTestReservations`
            // (no active reservation). The date is inside the ~30-min grace
            // window purely for realism - any date before `atHomeVisibleDate`
            // produces the same behavior.
            authzMode: 'Exam',
            date: new Date('2025-03-15T14:15:00Z'),
            rules: [ruleWithDeferredRelease],
            prairieTestReservations: [],
          });
          expect(result.authorized).toBe(false);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
        });
      });

      // Use case: real-time grading enabled during the exam. Students click
      // "finish" in Exam mode and review feedback/scores for the rest of
      // the reservation. Once they leave Exam mode, the gradebook hides both
      // and they can never see their work again.
      describe('real-time grading during exam, hidden after', () => {
        const ruleWithBothVisibleInExamMode = {
          ...makeMainRule({
            afterComplete: { questions: { hidden: true }, score: { hidden: true } },
          }),
          prairietestExams: [ptExam('pt-exam-1')],
        };

        it('shows both questions and score in Exam mode after finish', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [ruleWithBothVisibleInExamMode],
            prairieTestReservations: [validReservation],
          });
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(true);
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        it('hides both questions and score at home after the reservation ends', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Public',
            rules: [ruleWithBothVisibleInExamMode],
            prairieTestReservations: [],
          });
          // PT-gated rule with no DC has no at-home access path, so access is
          // denied; top-level afterComplete still propagates.
          expect(result.authorized).toBe(false);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
        });
      });

      // Use case: instructor uses PT to host a secure review session. In
      // Exam mode with a readOnly reservation, everything is visible for
      // review. In Public mode, the assessment is either denied entirely
      // (no top-level access) or has its score hidden from the gradebook
      // via top-level `afterComplete`.
      describe('PT-gated secure review session', () => {
        it('allows reviewing closed assessment with a readOnly reservation', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Exam',
            rules: [
              {
                ...makeMainRule(),
                prairietestExams: [ptExam('pt-exam-1', { readOnly: true })],
              },
            ],
            prairieTestReservations: [validReservation],
          });
          expect(result.authorized).toBe(true);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(true);
          expect(result.showClosedAssessmentScore).toBe(true);
        });

        it('denies access outside the session when no DC is configured', () => {
          const result = resolveAccessControl({
            ...baseInput,
            authzMode: 'Public',
            rules: [
              {
                ...makeMainRule({
                  afterComplete: { questions: { hidden: true }, score: { hidden: true } },
                }),
                prairietestExams: [ptExam('pt-exam-1', { readOnly: true })],
              },
            ],
            prairieTestReservations: [],
          });
          // A PT-gated rule with no dateControl has no at-home access path, so
          // access is denied; `afterComplete` still propagates for the gradebook.
          expect(result.authorized).toBe(false);
          expect(result.active).toBe(false);
          expect(result.showClosedAssessment).toBe(false);
          expect(result.showClosedAssessmentScore).toBe(false);
          expect(result.showBeforeRelease).toBe(false);
          expect(result.examAccessEnd).toBeNull();
        });
      });
    });

    describe('showBeforeRelease with PrairieTest', () => {
      const ptExam1 = ptExam('pt-exam-1');

      it('lists PT assessment as coming soon in Public mode when beforeRelease.listed is true', () => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [
            { ...makeMainRule({ beforeRelease: { listed: true } }), prairietestExams: [ptExam1] },
          ],
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(true);
        expect(result.active).toBe(false);
        expect(result.credit).toBe(0);
      });

      it('does not list or authorize PT assessment in exam mode when no matching reservation', () => {
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            { ...makeMainRule({ beforeRelease: { listed: true } }), prairietestExams: [ptExam1] },
          ],
          prairieTestReservations: [
            { examUuid: 'other-exam', accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(false);
        expect(result.active).toBe(false);
      });

      it('shows PT assessment past its due date as closed (Public) or hidden (Exam without matching reservation)', () => {
        // Public mode: DC path applies, past-due is shown as closed not "before
        // release". Exam mode: no matching reservation → deny outright.
        const publicResult = resolveAccessControl({
          ...baseInput,
          authzMode: 'Public',
          rules: [
            {
              ...makeMainRule({
                beforeRelease: { listed: true },
                dateControl: {
                  releaseDate: '2025-01-01T00:00:00Z',
                  dueDate: '2025-02-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam1],
            },
          ],
        });
        expect(publicResult.authorized).toBe(true);
        expect(publicResult.active).toBe(false);
        expect(publicResult.showBeforeRelease).toBe(false);

        const examResult = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            {
              ...makeMainRule({
                beforeRelease: { listed: true },
                dateControl: {
                  releaseDate: '2025-01-01T00:00:00Z',
                  dueDate: '2025-02-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam1],
            },
          ],
          prairieTestReservations: [
            { examUuid: 'wrong-exam', accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(examResult.authorized).toBe(false);
        expect(examResult.active).toBe(false);
        expect(examResult.showBeforeRelease).toBe(false);
      });

      it('grants access via PT reservation even when assessment is past due date', () => {
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            {
              ...makeMainRule({
                dateControl: {
                  releaseDate: '2025-01-01T00:00:00Z',
                  dueDate: '2025-02-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam1],
            },
          ],
          prairieTestReservations: [
            { examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(result.authorized).toBe(true);
        expect(result.credit).toBe(100);
        expect(result.active).toBe(true);
        expect(result.showBeforeRelease).toBe(false);
      });

      it('grants access via PT reservation even when assessment is before release date', () => {
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            {
              ...makeMainRule({
                dateControl: {
                  releaseDate: '2025-06-01T00:00:00Z',
                  dueDate: '2025-07-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam1],
            },
          ],
          prairieTestReservations: [
            { examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(result.authorized).toBe(true);
        expect(result.credit).toBe(100);
        expect(result.active).toBe(true);
        expect(result.showBeforeRelease).toBe(false);
      });

      it('lists PT-gated assessment as coming soon in Public mode before a future releaseDate', () => {
        // Public mode with a future releaseDate and beforeRelease.listed: the
        // DC path treats this like the non-PT pre-release listing. The
        // student sees the assessment in the "coming soon" list but is not
        // authorized to open it — PT gating is irrelevant here because PT
        // only applies in Exam mode.
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Public',
          rules: [
            {
              ...makeMainRule({
                beforeRelease: { listed: true },
                dateControl: { releaseDate: '2025-04-01T00:00:00Z' },
              }),
              prairietestExams: [ptExam1],
            },
          ],
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(true);
        expect(result.active).toBe(false);
        expect(result.credit).toBe(0);
      });

      it('suppresses showBeforeRelease during an active PT grant even when beforeRelease.listed is true', () => {
        // A granted student has real access and shouldn't also be shown the
        // "coming soon" listing. This matters specifically when no
        // releaseDate is configured - otherwise the grant branch zeroing
        // `creditResult.beforeRelease` would already make showBeforeRelease
        // false via the release-date clause.
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            {
              ...makeMainRule({ beforeRelease: { listed: true } }),
              prairietestExams: [ptExam1],
            },
          ],
          prairieTestReservations: [
            { examUuid: ptExam1.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') },
          ],
        });
        expect(result.authorized).toBe(true);
        expect(result.active).toBe(true);
        expect(result.credit).toBe(100);
        expect(result.showBeforeRelease).toBe(false);
      });

      it('denies PT-gated assessment in Exam mode during DC open window without matching reservation', () => {
        // In Exam mode, PT is the only access path; a student in Exam mode
        // without a matching reservation is denied even while DC is active.
        const result = resolveAccessControl({
          ...baseInput,
          authzMode: 'Exam',
          rules: [
            {
              ...makeMainRule({
                beforeRelease: { listed: true },
                dateControl: {
                  releaseDate: '2025-01-01T00:00:00Z',
                  dueDate: '2025-06-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam1],
            },
          ],
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(false);
        expect(result.active).toBe(false);
      });
    });
  });

  describe('time limit computation', () => {
    it('returns durationMinutes as time limit', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-04-01T00:00:00Z',
              durationMinutes: 60,
            },
          }),
        ],
      });
      expect(result.timeLimitMin).toBe(60);
    });

    it('caps time limit by seconds until next deadline', () => {
      // Date is 2025-03-15T12:00:00Z, due date is 30 minutes later
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-03-15T12:30:00Z',
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      // 30 minutes until deadline, minus 31 seconds = 1769 seconds / 60 = 29.48 -> floor = 29
      expect(result.timeLimitMin).toBe(29);
    });

    it('returns null time limit in exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          {
            rule: toRuntime({
              dateControl: { durationMinutes: 60, dueDate: '2025-04-01T00:00:00Z' },
            }),
            number: 0,
            targetType: 'none',
            enrollmentIds: [],
            studentLabelIds: [],
            prairietestExams: [ptExam('exam-uuid-1')],
          },
        ],
        authzMode: 'Exam',
        prairieTestReservations: [
          {
            examUuid: 'exam-uuid-1',
            accessEnd: new Date('2025-03-15T14:00:00Z'),
          },
        ],
      });
      expect(result.timeLimitMin).toBeNull();
    });

    it('clamps time limit to zero when deadline is less than 31 seconds away', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              dueDate: '2025-03-15T12:00:20Z',
              durationMinutes: 60,
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      // 20 seconds until deadline, minus 31 seconds = negative -> should clamp to 0
      expect(result.timeLimitMin).toBe(0);
    });

    it('returns null when no durationMinutes', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
          }),
        ],
      });
      expect(result.timeLimitMin).toBeNull();
    });
  });

  describe('after-complete visibility', () => {
    it('hides questions by default when questions.hidden is not set', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('shows questions when questions.hidden is explicitly false', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { questions: { hidden: false } },
          }),
        ],
      });
      expect(result.showClosedAssessment).toBe(true);
    });

    it('still shows score by default when afterComplete is undefined', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.showClosedAssessmentScore).toBe(true);
    });

    it('hides assessment when questions.hidden is true', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { questions: { hidden: true } },
          }),
        ],
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('shows assessment again after questions.visibleFromDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: {
              questions: {
                hidden: true,
                visibleFromDate: '2025-03-10T00:00:00Z',
              },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showClosedAssessment).toBe(true);
    });

    it('hides assessment again after questions.visibleUntilDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
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
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('hides score when score.hidden is true', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { score: { hidden: true } },
          }),
        ],
      });
      expect(result.showClosedAssessmentScore).toBe(false);
    });

    it('shows score again after score.visibleFromDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: {
              score: {
                hidden: true,
                visibleFromDate: '2025-03-10T00:00:00Z',
              },
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showClosedAssessmentScore).toBe(true);
    });

    it('hides questions when a merged main + override produces visible-questions + hidden-score', () => {
      // Per-rule validation forbids `score.hidden: true` alongside
      // `questions.hidden: false` on a single rule, but merging is independent
      // per sub-object: a main rule that only sets `questions` combined with
      // an override that only sets `score` can yield the forbidden pair.
      // The resolver must clamp to "hide questions" rather than show answers
      // without a score.
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { questions: { hidden: false } },
          }),
          makeOverrideRule(
            1,
            { afterComplete: { score: { hidden: true } } },
            { enrollmentIds: [defaultEnrollment.enrollmentId] },
          ),
        ],
      });
      expect(result.showClosedAssessmentScore).toBe(false);
      expect(result.showClosedAssessment).toBe(false);
    });
  });

  describe('credit date string formatting', () => {
    it('shows credit percentage and deadline', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-04-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.creditDateString).toMatch(/^100% until /);
    });

    it('shows "None" when no credit', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              dueDate: '2025-03-10T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.creditDateString).toBe('None');
    });

    it('shows "None" when no dateControl configured', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.creditDateString).toBe('None');
    });
  });

  describe('timeline edge cases from cascading', () => {
    it('blocks access when due date is before release date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-15T00:00:00Z',
              dueDate: '2025-04-01T00:00:00Z',
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-03-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-03-20T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('ignores early deadline that falls before release date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-03T00:00:00Z',
              earlyDeadlines: [
                { date: '2025-03-01T00:00:00Z', credit: 120 },
                { date: '2025-03-10T00:00:00Z', credit: 110 },
              ],
              dueDate: '2025-03-20T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-05T00:00:00Z'),
      });
      expect(result.credit).toBe(110);
    });

    it('ignores late deadline that falls before release date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-15T00:00:00Z',
              dueDate: '2025-03-20T00:00:00Z',
              lateDeadlines: [
                { date: '2025-03-10T00:00:00Z', credit: 80 },
                { date: '2025-03-25T00:00:00Z', credit: 50 },
              ],
            },
          }),
        ],
        date: new Date('2025-03-22T00:00:00Z'),
      });
      expect(result.credit).toBe(50);
    });

    it('filters out early deadlines that fall after a cascaded due date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-01-01T00:00:00Z',
              earlyDeadlines: [
                { date: '2025-03-01T00:00:00Z', credit: 120 },
                { date: '2025-03-02T00:00:00Z', credit: 110 },
              ],
              dueDate: '2025-03-15T00:00:00Z',
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-02-15T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-01-15T00:00:00Z'),
      });
      // Early deadlines are after due date (Feb 15), so ignored
      expect(result.credit).toBe(100);
    });

    it('ignores late deadline that falls before due date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-03-20T00:00:00Z',
              lateDeadlines: [{ date: '2025-03-25T00:00:00Z', credit: 80 }],
            },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-03-30T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        date: new Date('2025-04-01T00:00:00Z'),
      });
      // Late deadline March 25 < due date March 30, so ignored → past due date → 0
      expect(result.credit).toBe(0);
    });

    it('ignores afterLastDeadline when there are no deadlines', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              afterLastDeadline: { credit: 50, allowSubmissions: true },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
    });
  });

  describe('migrated non-100% credit rules', () => {
    it('gives reduced credit before late deadline when no dueDate', () => {
      // Migrated from: { credit: 50, startDate: ..., endDate: '2025-04-01' }
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              lateDeadlines: [{ date: '2025-04-01T00:00:00Z', credit: 50 }],
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(50);
      expect(result.active).toBe(true);
    });

    it('gives 0 credit after late deadline when no dueDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              lateDeadlines: [{ date: '2025-04-01T00:00:00Z', credit: 50 }],
            },
          }),
        ],
        date: new Date('2025-04-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('gives bonus credit before early deadline when no dueDate', () => {
      // Migrated from: { credit: 120, startDate: ..., endDate: '2025-04-01' }
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              earlyDeadlines: [{ date: '2025-04-01T00:00:00Z', credit: 120 }],
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(120);
      expect(result.active).toBe(true);
    });

    it('gives 0 credit after early deadline when no dueDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              earlyDeadlines: [{ date: '2025-04-01T00:00:00Z', credit: 120 }],
            },
          }),
        ],
        date: new Date('2025-04-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });

    it('resolves bonus+reduced declining credit without dueDate', () => {
      // Migrated from: [{ credit: 120, endDate: '2025-03-10' }, { credit: 50, endDate: '2025-04-01' }]
      const rule = makeMainRule({
        dateControl: {
          releaseDate: '2025-03-01T00:00:00Z',
          earlyDeadlines: [{ date: '2025-03-10T00:00:00Z', credit: 120 }],
          lateDeadlines: [{ date: '2025-04-01T00:00:00Z', credit: 50 }],
        },
      });

      const beforeBonus = resolveAccessControl({
        ...baseInput,
        rules: [rule],
        date: new Date('2025-03-05T00:00:00Z'),
      });
      expect(beforeBonus.credit).toBe(120);

      const afterBonus = resolveAccessControl({
        ...baseInput,
        rules: [rule],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(afterBonus.credit).toBe(50);

      const afterAll = resolveAccessControl({
        ...baseInput,
        rules: [rule],
        date: new Date('2025-04-15T00:00:00Z'),
      });
      expect(afterAll.credit).toBe(0);
    });
  });

  describe('showBeforeRelease edge cases', () => {
    it('shows before release when beforeRelease.listed set without dateControl', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({ beforeRelease: { listed: true } })],
      });
      // Supported use case: instructor lists every assessment a student will
      // take over the term, perpetually "coming soon" until dates are added.
      // `showBeforeRelease: true` renders the listing; `authorized: false`
      // prevents the student from navigating to the assessment URL.
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
      expect(result.showClosedAssessment).toBe(false);
    });

    it('shows before release when dateControl has no releaseDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            beforeRelease: { listed: true },
            dateControl: {
              dueDate: '2025-04-01T00:00:00Z',
            },
          }),
        ],
      });
      // dateControl exists but no releaseDate → perpetually "before release"
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('does not show before release without beforeRelease.listed and no dateControl', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.authorized).toBe(true);
      expect(result.showBeforeRelease).toBe(false);
    });
  });
});

describe('mergeRules', () => {
  it('returns main rule when override is null', () => {
    const main = toRuntime({ beforeRelease: { listed: true } });
    expect(mergeRules(main, null)).toEqual(main);
  });

  it('preserves main dateControl fields not in override', () => {
    const result = mergeRules(
      toRuntime({ dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'secret' } }),
      toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-05-01T00:00:00Z'));
    expect(result.dateControl?.password).toBe('secret');
  });

  it('does not mutate main rule', () => {
    const main = toRuntime({
      dateControl: { dueDate: '2025-04-01T00:00:00Z' },
    });
    mergeRules(main, toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }));
    expect(main.dateControl?.dueDate).toEqual(new Date('2025-04-01T00:00:00Z'));
  });

  it('sets dateControl from override when main has none', () => {
    const result = mergeRules(
      toRuntime({}),
      toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-05-01T00:00:00Z'));
  });

  it('sets afterComplete from override when main has none', () => {
    const result = mergeRules(
      toRuntime({}),
      toRuntime({ afterComplete: { questions: { hidden: true } } }),
    );
    expect(result.afterComplete?.questions?.hidden).toBe(true);
  });

  it('merges afterComplete fields', () => {
    const result = mergeRules(
      toRuntime({
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      }),
      toRuntime({ afterComplete: { questions: { hidden: false } } }),
    );
    expect(result.afterComplete?.questions?.hidden).toBe(false);
    expect(result.afterComplete?.score?.hidden).toBe(true);
  });

  it('allows override to clear main rule after-complete dates', () => {
    const result = mergeRules(
      toRuntime({
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2025-06-01T00:00:00Z',
            visibleUntilDate: '2025-09-01T00:00:00Z',
          },
          score: {
            hidden: true,
            visibleFromDate: '2025-07-01T00:00:00Z',
          },
        },
      }),
      toRuntime({
        afterComplete: {
          questions: {
            hidden: true,
          },
          score: {
            hidden: true,
          },
        },
      }),
    );
    expect(result.afterComplete?.questions?.hidden).toBe(true);
    expect(result.afterComplete?.questions?.visibleFromDate).toBeUndefined();
    expect(result.afterComplete?.questions?.visibleUntilDate).toBeUndefined();
    expect(result.afterComplete?.score?.hidden).toBe(true);
    expect(result.afterComplete?.score?.visibleFromDate).toBeUndefined();
  });

  it.each<{ field: keyof RuntimeAccessControl; main: AccessControlJson }>([
    { field: 'labels', main: { labels: ['group-a'] } },
    { field: 'integrations', main: { integrations: { prairieTest: { exams: [] } } } },
  ])('does not inherit $field from main', ({ field, main }) => {
    const result = mergeRules(toRuntime(main), toRuntime({}));
    expect(result[field]).toBeUndefined();
  });

  it('inherits releaseDate from main when override does not set it', () => {
    const result = mergeRules(
      toRuntime({
        dateControl: { releaseDate: '2025-03-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
      }),
      toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }),
    );
    expect(result.dateControl?.releaseDate).toEqual(new Date('2025-03-01T00:00:00Z'));
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-05-01T00:00:00Z'));
  });

  it('inherits afterComplete from main when override has none', () => {
    const result = mergeRules(
      toRuntime({ afterComplete: { questions: { hidden: true } } }),
      toRuntime({}),
    );
    expect(result.afterComplete?.questions?.hidden).toBe(true);
  });

  it('inherits dateControl sub-fields from main when override has none', () => {
    const result = mergeRules(
      toRuntime({ dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'secret' } }),
      toRuntime({}),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-04-01T00:00:00Z'));
    expect(result.dateControl?.password).toBe('secret');
  });

  it('clears main afterLastDeadline credit when override disables submissions', () => {
    const result = mergeRules(
      toRuntime({
        dateControl: {
          afterLastDeadline: { allowSubmissions: true, credit: 25 },
        },
      }),
      toRuntime({
        dateControl: {
          afterLastDeadline: { allowSubmissions: false },
        },
      }),
    );
    expect(result.dateControl?.afterLastDeadline).toEqual({
      allowSubmissions: false,
    });
  });

  it('ignores beforeRelease on overrides', () => {
    const result = mergeRules(
      toRuntime({ beforeRelease: { listed: false } }),
      toRuntime({ beforeRelease: { listed: true } }),
    );
    expect(result.beforeRelease?.listed).toBe(false);
  });
});

describe('cascadeOverrides', () => {
  it('merges dateControl sub-fields from base and next', () => {
    const result = cascadeOverrides(
      toRuntime({ dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'pw1' } }),
      toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-05-01T00:00:00Z'));
    expect(result.dateControl?.password).toBe('pw1');
  });

  it('inherits all dateControl from base when next has none', () => {
    const result = cascadeOverrides(
      toRuntime({ dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'pw1' } }),
      toRuntime({}),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-04-01T00:00:00Z'));
    expect(result.dateControl?.password).toBe('pw1');
  });

  it('sets dateControl from next when base has none', () => {
    const result = cascadeOverrides(
      toRuntime({}),
      toRuntime({ dateControl: { dueDate: '2025-05-01T00:00:00Z' } }),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-05-01T00:00:00Z'));
  });

  it('merges afterComplete sub-fields', () => {
    const result = cascadeOverrides(
      toRuntime({
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      }),
      toRuntime({ afterComplete: { questions: { hidden: false } } }),
    );
    expect(result.afterComplete?.questions?.hidden).toBe(false);
    expect(result.afterComplete?.score?.hidden).toBe(true);
  });

  it('does not carry beforeRelease through cascaded overrides', () => {
    const result = cascadeOverrides(toRuntime({ beforeRelease: { listed: true } }), toRuntime({}));
    expect(result.beforeRelease).toBeUndefined();
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
  it('formats date in the given timezone', () => {
    // 2025-03-15T12:00:00Z in America/Chicago is 07:00 CDT
    const result = formatDateShort(new Date('2025-03-15T12:00:00Z'), 'America/Chicago');
    expect(result).toMatch(/07:00/);
    expect(result).toMatch(/Sat/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
  });

  it('formats date in UTC', () => {
    const result = formatDateShort(new Date('2025-03-15T14:30:00Z'), 'UTC');
    expect(result).toMatch(/14:30/);
    expect(result).toMatch(/Sat/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
  });
});
