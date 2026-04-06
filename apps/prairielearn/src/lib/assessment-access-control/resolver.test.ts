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
      releaseDate:
        releaseDate !== undefined
          ? releaseDate !== null
            ? new Date(releaseDate)
            : null
          : undefined,
      dueDate: dueDate !== undefined ? (dueDate !== null ? new Date(dueDate) : null) : undefined,
    };
  }
  if (afterComplete) {
    const { showQuestionsAgainDate, hideQuestionsAgainDate, showScoreAgainDate, ...acRest } =
      afterComplete;
    result.afterComplete = {
      ...acRest,
      showQuestionsAgainDate:
        showQuestionsAgainDate != null ? new Date(showQuestionsAgainDate) : showQuestionsAgainDate,
      hideQuestionsAgainDate:
        hideQuestionsAgainDate != null ? new Date(hideQuestionsAgainDate) : hideQuestionsAgainDate,
      showScoreAgainDate:
        showScoreAgainDate != null ? new Date(showScoreAgainDate) : showScoreAgainDate,
    };
  }
  return result;
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
    it('denies access before release date when listBeforeRelease is false', () => {
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

    it('gives 0% credit after last deadline by default', () => {
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

    it('uses afterLastDeadline credit when specified', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              dueDate: '2025-03-10T00:00:00Z',
              afterLastDeadline: { credit: 25 },
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
              afterLastDeadline: { credit: 25, allowSubmissions: false },
            },
          }),
        ],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(25);
      expect(result.active).toBe(false);
    });

    it('returns showBeforeRelease when set and before release', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            listBeforeRelease: true,
            dateControl: {
              releaseDate: '2025-04-01T00:00:00Z',
              dueDate: '2025-05-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.authorized).toBe(true);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('does not set showBeforeRelease after release', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            listBeforeRelease: true,
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
  });

  describe('early deadline bonus credit', () => {
    it('gives bonus credit before early deadline', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              earlyDeadlines: [{ date: '2025-03-10T00:00:00Z', credit: 110 }],
              dueDate: '2025-03-20T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-05T00:00:00Z'),
      });
      expect(result.credit).toBe(110);
      expect(result.active).toBe(true);
    });

    it('gives 100% credit after early deadline but before due date', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              releaseDate: '2025-03-01T00:00:00Z',
              earlyDeadlines: [{ date: '2025-03-10T00:00:00Z', credit: 110 }],
              dueDate: '2025-03-20T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-12T00:00:00Z'),
      });
      expect(result.credit).toBe(100);
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

  describe('override priority', () => {
    it('later matching override wins via cascading', () => {
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
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // Both overrides apply, second (due July 1 UTC = Jun 30 CDT) wins
      expect(result.credit).toBe(100);
      expect(result.creditDateString).toContain('Jun 30');
    });

    it('applies all matching overrides', () => {
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
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        enrollment: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // Second override (due July 1 UTC = Jun 30 CDT) wins via cascade
      expect(result.creditDateString).toContain('Jun 30');
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
      prairietestExams: [{ uuid: 'exam-uuid-1', readOnly: false }],
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

    it('denies access when not in exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Public',
        prairieTestReservations: [validReservation],
      });
      expect(result.authorized).toBe(false);
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
        prairietestExams: [{ uuid: 'exam-uuid-1', readOnly: true }],
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

    it('grants access when rule has multiple configured exams and reservation matches one', () => {
      const multiExamRule: AccessControlRuleInput = {
        ...prairieTestMainRule,
        prairietestExams: [
          { uuid: 'exam-uuid-1', readOnly: false },
          { uuid: 'exam-uuid-2', readOnly: false },
          { uuid: 'exam-uuid-3', readOnly: true },
        ],
      };
      const reservation: PrairieTestReservation = {
        examUuid: 'exam-uuid-2',
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
      expect(result.active).toBe(true);
      expect(result.examAccessEnd).toEqual(reservation.accessEnd);
    });

    it('uses readOnly flag from matched exam when multiple exams are configured', () => {
      const multiExamRule: AccessControlRuleInput = {
        ...prairieTestMainRule,
        prairietestExams: [
          { uuid: 'exam-uuid-1', readOnly: false },
          { uuid: 'exam-uuid-3', readOnly: true },
        ],
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
            afterLastDeadline: { credit: 50 },
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
            prairietestExams: [{ uuid: 'exam-uuid-1', readOnly: false }],
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
    it('hides questions by default when hideQuestions is not set', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('shows questions when hideQuestions is explicitly false', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { hideQuestions: false },
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

    it('hides assessment when hideQuestions is true', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { hideQuestions: true },
          }),
        ],
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('shows assessment again after showQuestionsAgainDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: {
              hideQuestions: true,
              showQuestionsAgainDate: '2025-03-10T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showClosedAssessment).toBe(true);
    });

    it('hides assessment again after hideQuestionsAgainDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: {
              hideQuestions: true,
              showQuestionsAgainDate: '2025-03-10T00:00:00Z',
              hideQuestionsAgainDate: '2025-03-14T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showClosedAssessment).toBe(false);
    });

    it('hides score when hideScore is true', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: { hideScore: true },
          }),
        ],
      });
      expect(result.showClosedAssessmentScore).toBe(false);
    });

    it('shows score again after showScoreAgainDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            afterComplete: {
              hideScore: true,
              showScoreAgainDate: '2025-03-10T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.showClosedAssessmentScore).toBe(true);
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

    it('handles early deadline after due date by using due date', () => {
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
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });
  });

  describe('no date control defaults', () => {
    it.each([
      { label: 'dateControl absent', rule: {} },
      {
        label: 'dateControl has no releaseDate',
        rule: { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
      },
      {
        label: 'dateControl has releaseDate but no deadlines/due date',
        rule: { dateControl: { releaseDate: '2025-03-01T00:00:00Z' } },
      },
    ])('returns 0 credit when $label', ({ rule }) => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule(rule)],
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
      expect(result.active).toBe(false);
    });
  });

  describe('afterComplete visibility edge cases', () => {
    const cases: {
      label: string;
      afterComplete: AccessControlJson['afterComplete'];
      date?: string;
      expectedAssessment?: boolean;
      expectedScore?: boolean;
    }[] = [
      {
        label: 'ignores showQuestionsAgainDate when hideQuestions is false',
        afterComplete: { hideQuestions: false, showQuestionsAgainDate: '2025-06-01T00:00:00Z' },
        expectedAssessment: true,
      },
      {
        label: 'ignores hideQuestionsAgainDate when hideQuestions is false',
        afterComplete: { hideQuestions: false, hideQuestionsAgainDate: '2025-01-01T00:00:00Z' },
        expectedAssessment: true,
      },
      {
        label: 'ignores showScoreAgainDate when hideScore is false',
        afterComplete: { hideScore: false, showScoreAgainDate: '2025-06-01T00:00:00Z' },
        expectedAssessment: false,
        expectedScore: true,
      },
      {
        label: 'ignores hideQuestionsAgainDate when showQuestionsAgainDate is not set',
        afterComplete: { hideQuestions: true, hideQuestionsAgainDate: '2025-04-01T00:00:00Z' },
        date: '2025-05-01T00:00:00Z',
        expectedAssessment: false,
      },
    ];

    it.each(cases)(
      '$label',
      ({ afterComplete, date, expectedAssessment = true, expectedScore = true }) => {
        const result = resolveAccessControl({
          ...baseInput,
          rules: [
            makeMainRule({
              dateControl: { dueDate: '2025-03-10T00:00:00Z' },
              afterComplete,
            }),
          ],
          ...(date ? { date: new Date(date) } : {}),
        });
        expect(result.showClosedAssessment).toBe(expectedAssessment);
        expect(result.showClosedAssessmentScore).toBe(expectedScore);
      },
    );
  });

  describe('showBeforeRelease edge cases', () => {
    it('shows before release when listBeforeRelease set without dateControl', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({ listBeforeRelease: true })],
      });
      // No dateControl → no release mechanism → perpetually "before release"
      expect(result.authorized).toBe(true);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('shows before release when dateControl has no releaseDate', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            listBeforeRelease: true,
            dateControl: {
              dueDate: '2025-04-01T00:00:00Z',
            },
          }),
        ],
      });
      // dateControl exists but no releaseDate → perpetually "before release"
      expect(result.authorized).toBe(true);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('does not show before release without listBeforeRelease and no dateControl', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.authorized).toBe(true);
      expect(result.showBeforeRelease).toBe(false);
    });
  });

  describe('showBeforeRelease with PrairieTest', () => {
    const ptExam = { uuid: 'pt-exam-1', readOnly: false };

    it('lists but does not authorize PT assessment when listBeforeRelease set and not in exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [{ ...makeMainRule({ listBeforeRelease: true }), prairietestExams: [ptExam] }],
      });
      // Not in exam mode but listBeforeRelease → listed but not authorized
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('hides PT assessment when listBeforeRelease false and not in exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [{ ...makeMainRule(), prairietestExams: [ptExam] }],
      });
      expect(result.authorized).toBe(false);
    });

    it('does not list or authorize PT assessment in exam mode when no matching reservation', () => {
      const result = resolveAccessControl({
        ...baseInput,
        authzMode: 'Exam',
        rules: [{ ...makeMainRule({ listBeforeRelease: true }), prairietestExams: [ptExam] }],
        prairieTestReservations: [
          { examUuid: 'other-exam', accessEnd: new Date('2025-04-01T00:00:00Z') },
        ],
      });
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(false);
      expect(result.active).toBe(false);
    });

    it('hides PT assessment when listBeforeRelease false and no matching reservation', () => {
      const result = resolveAccessControl({
        ...baseInput,
        authzMode: 'Exam',
        rules: [{ ...makeMainRule(), prairietestExams: [ptExam] }],
        prairieTestReservations: [
          { examUuid: 'other-exam', accessEnd: new Date('2025-04-01T00:00:00Z') },
        ],
      });
      expect(result.authorized).toBe(false);
      expect(result.showBeforeRelease).toBe(false);
      expect(result.active).toBe(false);
    });

    it('does not grant access to PT assessment via listBeforeRelease bypass', () => {
      // Regression test: listBeforeRelease must not set authorized=true for
      // PrairieTest-gated assessments, otherwise students can start instances
      // by posting directly to the assessment URL.
      for (const authzMode of ['Public', 'Exam'] as const) {
        const result = resolveAccessControl({
          ...baseInput,
          authzMode,
          rules: [{ ...makeMainRule({ listBeforeRelease: true }), prairietestExams: [ptExam] }],
          prairieTestReservations:
            authzMode === 'Exam'
              ? [{ examUuid: 'wrong-exam', accessEnd: new Date('2025-04-01T00:00:00Z') }]
              : [],
        });
        expect(result.authorized).toBe(false);
        expect(result.showBeforeRelease).toBe(authzMode === 'Public');
        expect(result.credit).toBe(0);
      }
    });

    it('shows closed PT assessment as closed instead of "before release" when past due date', () => {
      // When a PT-gated assessment has date controls and is past its due
      // date, it should show as a normal closed assessment rather than "Not
      // yet open" indefinitely.
      for (const authzMode of ['Public', 'Exam'] as const) {
        const result = resolveAccessControl({
          ...baseInput,
          authzMode,
          rules: [
            {
              ...makeMainRule({
                listBeforeRelease: true,
                dateControl: {
                  releaseDate: '2025-01-01T00:00:00Z',
                  dueDate: '2025-02-01T00:00:00Z',
                },
              }),
              prairietestExams: [ptExam],
            },
          ],
          prairieTestReservations:
            authzMode === 'Exam'
              ? [{ examUuid: 'wrong-exam', accessEnd: new Date('2025-04-01T00:00:00Z') }]
              : [],
        });
        expect(result.showBeforeRelease).toBe(false);
        expect(result.authorized).toBe(true);
        expect(result.active).toBe(false);
      }
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
            prairietestExams: [ptExam],
          },
        ],
        prairieTestReservations: [
          { examUuid: ptExam.uuid, accessEnd: new Date('2025-04-01T00:00:00Z') },
        ],
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
      expect(result.showBeforeRelease).toBe(false);
    });

    it('still shows "before release" for PT assessment that is open but student lacks access', () => {
      // When a PT-gated assessment has date controls and is within its open
      // period, students without PT access should still see "Not yet open".
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          {
            ...makeMainRule({
              listBeforeRelease: true,
              dateControl: {
                releaseDate: '2025-01-01T00:00:00Z',
                dueDate: '2025-06-01T00:00:00Z',
              },
            }),
            prairietestExams: [ptExam],
          },
        ],
      });
      expect(result.showBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });
  });
});

describe('mergeRules', () => {
  it('returns main rule when override is null', () => {
    const main = toRuntime({ listBeforeRelease: true });
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
    const result = mergeRules(toRuntime({}), toRuntime({ afterComplete: { hideQuestions: true } }));
    expect(result.afterComplete?.hideQuestions).toBe(true);
  });

  it('merges afterComplete fields', () => {
    const result = mergeRules(
      toRuntime({ afterComplete: { hideQuestions: true, hideScore: true } }),
      toRuntime({ afterComplete: { hideQuestions: false } }),
    );
    expect(result.afterComplete?.hideQuestions).toBe(false);
    expect(result.afterComplete?.hideScore).toBe(true);
  });

  it('allows override to clear main rule after-complete dates via null', () => {
    const result = mergeRules(
      toRuntime({
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2025-06-01T00:00:00Z',
          hideQuestionsAgainDate: '2025-09-01T00:00:00Z',
          hideScore: true,
          showScoreAgainDate: '2025-07-01T00:00:00Z',
        },
      }),
      toRuntime({
        afterComplete: {
          showQuestionsAgainDate: null,
          hideQuestionsAgainDate: null,
          showScoreAgainDate: null,
        },
      }),
    );
    expect(result.afterComplete?.hideQuestions).toBe(true);
    expect(result.afterComplete?.showQuestionsAgainDate).toBeNull();
    expect(result.afterComplete?.hideQuestionsAgainDate).toBeNull();
    expect(result.afterComplete?.hideScore).toBe(true);
    expect(result.afterComplete?.showScoreAgainDate).toBeNull();
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

  it('override can set releaseDate to null to block date-based access', () => {
    const result = mergeRules(
      toRuntime({
        dateControl: { releaseDate: '2025-03-01T00:00:00Z', dueDate: '2025-04-01T00:00:00Z' },
      }),
      toRuntime({ dateControl: { releaseDate: null } }),
    );
    expect(result.dateControl?.releaseDate).toBeNull();
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-04-01T00:00:00Z'));
  });

  it('inherits afterComplete from main when override has none', () => {
    const result = mergeRules(toRuntime({ afterComplete: { hideQuestions: true } }), toRuntime({}));
    expect(result.afterComplete?.hideQuestions).toBe(true);
  });

  it('inherits dateControl sub-fields from main when override has none', () => {
    const result = mergeRules(
      toRuntime({ dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'secret' } }),
      toRuntime({}),
    );
    expect(result.dateControl?.dueDate).toEqual(new Date('2025-04-01T00:00:00Z'));
    expect(result.dateControl?.password).toBe('secret');
  });

  it('ignores listBeforeRelease on overrides', () => {
    const result = mergeRules(
      toRuntime({ listBeforeRelease: false }),
      toRuntime({ listBeforeRelease: true }),
    );
    expect(result.listBeforeRelease).toBe(false);
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
      toRuntime({ afterComplete: { hideQuestions: true, hideScore: true } }),
      toRuntime({ afterComplete: { hideQuestions: false } }),
    );
    expect(result.afterComplete?.hideQuestions).toBe(false);
    expect(result.afterComplete?.hideScore).toBe(true);
  });

  it('does not carry listBeforeRelease through cascaded overrides', () => {
    const result = cascadeOverrides(toRuntime({ listBeforeRelease: true }), toRuntime({}));
    expect(result.listBeforeRelease).toBeUndefined();
  });
});

describe('resolveVisibility', () => {
  const now = new Date('2025-03-15T12:00:00Z');

  it('returns true when hide is false', () => {
    expect(resolveVisibility(false, undefined, undefined, now)).toBe(true);
  });

  it('returns true when hide is undefined', () => {
    expect(resolveVisibility(undefined, undefined, undefined, now)).toBe(true);
  });

  it('returns false when hide is true and no show-again date', () => {
    expect(resolveVisibility(true, undefined, undefined, now)).toBe(false);
  });

  it('returns false when hide is true and show-again date is null', () => {
    expect(resolveVisibility(true, null, undefined, now)).toBe(false);
  });

  it('returns true when past show-again date', () => {
    expect(resolveVisibility(true, new Date('2025-03-10T00:00:00Z'), undefined, now)).toBe(true);
  });

  it('returns false when before show-again date', () => {
    expect(resolveVisibility(true, new Date('2025-03-20T00:00:00Z'), undefined, now)).toBe(false);
  });

  it('returns false when past hide-again date', () => {
    expect(
      resolveVisibility(
        true,
        new Date('2025-03-10T00:00:00Z'),
        new Date('2025-03-14T00:00:00Z'),
        now,
      ),
    ).toBe(false);
  });

  it('returns true when past show-again but before hide-again', () => {
    expect(
      resolveVisibility(
        true,
        new Date('2025-03-10T00:00:00Z'),
        new Date('2025-03-20T00:00:00Z'),
        now,
      ),
    ).toBe(true);
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
