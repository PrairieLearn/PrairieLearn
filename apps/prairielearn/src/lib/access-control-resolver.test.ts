import { describe, expect, it } from 'vitest';

import type { AccessControlJson } from '../schemas/accessControl.js';

import {
  type AccessControlResolverInput,
  type AccessControlRuleInput,
  type PrairieTestReservation,
  type StudentContext,
  computeCredit,
  formatDateShort,
  mergeRules,
  resolveAccessControl,
  resolveVisibility,
} from './access-control-resolver.js';

function makeMainRule(rule: AccessControlJson = {}): AccessControlRuleInput {
  return {
    rule,
    number: 0,
    targetType: 'none',
    enrollmentIds: [],
    studentLabelIds: [],
    prairietestExamUuids: [],
  };
}

function makeOverrideRule(
  number: number,
  rule: AccessControlJson,
  opts: Partial<Omit<AccessControlRuleInput, 'rule' | 'number'>> = {},
): AccessControlRuleInput {
  return {
    rule,
    number,
    targetType: opts.targetType ?? 'enrollment',
    enrollmentIds: opts.enrollmentIds ?? [],
    studentLabelIds: opts.studentLabelIds ?? [],
    prairietestExamUuids: opts.prairietestExamUuids ?? [],
  };
}

const defaultStudent: StudentContext = {
  enrollmentId: 'enroll-1',
  studentLabelIds: ['label-1'],
};

const baseInput: AccessControlResolverInput = {
  rules: [makeMainRule()],
  student: defaultStudent,
  date: new Date('2025-03-15T12:00:00Z'),
  displayTimezone: 'America/Chicago',
  authzMode: 'Public',
  authzModeReason: 'Default',
  courseRole: 'None',
  courseInstanceRole: 'None',
  prairieTestReservation: null,
};

describe('resolveAccessControl', () => {
  describe('staff override', () => {
    it('grants full access for Previewer course role', () => {
      const result = resolveAccessControl({ ...baseInput, courseRole: 'Previewer' });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
      expect(result.creditDateString).toBe('100% (Staff override)');
      expect(result.timeLimitMin).toBeNull();
      expect(result.password).toBeNull();
    });

    it('grants full access for Viewer course role', () => {
      const result = resolveAccessControl({ ...baseInput, courseRole: 'Viewer' });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
    });

    it('grants full access for Editor course role', () => {
      const result = resolveAccessControl({ ...baseInput, courseRole: 'Editor' });
      expect(result.authorized).toBe(true);
    });

    it('grants full access for Owner course role', () => {
      const result = resolveAccessControl({ ...baseInput, courseRole: 'Owner' });
      expect(result.authorized).toBe(true);
    });

    it('grants full access for Student Data Viewer instance role', () => {
      const result = resolveAccessControl({
        ...baseInput,
        courseInstanceRole: 'Student Data Viewer',
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
    });

    it('grants full access for Student Data Editor instance role', () => {
      const result = resolveAccessControl({
        ...baseInput,
        courseInstanceRole: 'Student Data Editor',
      });
      expect(result.authorized).toBe(true);
    });

    it('does not grant staff override for None/None roles', () => {
      const result = resolveAccessControl(baseInput);
      // Not staff, but main rule with no date control should still authorize
      expect(result.authorized).toBe(true);
      expect(result.creditDateString).not.toBe('100% (Staff override)');
    });
  });

  describe('main rule only, no date control', () => {
    it('always authorizes with 100% credit', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
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

    it('gives late deadline credit after due date', () => {
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
        date: new Date('2025-03-12T00:00:00Z'),
      });
      expect(result.authorized).toBe(true);
      expect(result.credit).toBe(80);
      expect(result.active).toBe(true);
    });

    it('gives second late deadline credit in later period', () => {
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
        date: new Date('2025-03-17T00:00:00Z'),
      });
      expect(result.credit).toBe(50);
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

    it('returns listBeforeRelease when set and before release', () => {
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
      expect(result.listBeforeRelease).toBe(true);
      expect(result.active).toBe(false);
    });

    it('does not set listBeforeRelease after release', () => {
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
      expect(result.listBeforeRelease).toBe(false);
    });

    it('handles dateControl with enabled=false as no date control', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
              enabled: false,
              dueDate: '2025-01-01T00:00:00Z',
            },
          }),
        ],
        date: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result.credit).toBe(100);
      expect(result.active).toBe(true);
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

  describe('block access', () => {
    it('denies access when blockAccess is true', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({ blockAccess: true })],
      });
      expect(result.authorized).toBe(false);
      expect(result.blockAccess).toBe(true);
    });

    it('allows access when blockAccess is false', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({ blockAccess: false })],
      });
      expect(result.authorized).toBe(true);
      expect(result.blockAccess).toBe(false);
    });
  });

  describe('disabled rule', () => {
    it('denies access when main rule is disabled', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({ enabled: false })],
      });
      expect(result.authorized).toBe(false);
    });
  });

  describe('override matching by enrollment', () => {
    it('applies override when enrollment ID matches', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
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
        student: { enrollmentId: null, studentLabelIds: [] },
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
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
            { targetType: 'student_label', studentLabelIds: ['label-1', 'label-2'] },
          ),
        ],
        student: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
        date: new Date('2025-03-15T00:00:00Z'),
      });
      expect(result.credit).toBe(0);
    });
  });

  describe('override priority', () => {
    it('first matching override wins', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // First override (due June 1 UTC = May 31 CDT) should win over second (due July 1)
      expect(result.credit).toBe(100);
      // Verify the next deadline is from override 1, not override 2
      expect(result.creditDateString).toContain('May 31');
    });

    it('skips disabled overrides', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
          }),
          makeOverrideRule(
            1,
            { enabled: false, dateControl: { dueDate: '2025-06-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
          makeOverrideRule(
            2,
            { dateControl: { dueDate: '2025-07-01T00:00:00Z' } },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // First override is disabled, so second override (due July 1 UTC = Jun 30 CDT) should apply
      expect(result.creditDateString).toContain('Jun 30');
    });
  });

  describe('override type precedence', () => {
    it('enrollment override takes precedence over student_label override', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Enrollment override (due June 1 UTC = May 31 CDT) wins over student label (July 1)
      expect(result.creditDateString).toContain('May 31');
    });

    it('enrollment override wins even when student_label has lower number and is listed first', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Enrollment override should win despite student_label having lower number
      expect(result.creditDateString).toContain('May 31');
    });

    it('student_label override applies when no enrollment override matches', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: ['label-1'] },
      });
      // Only student label override matches (due July 1 UTC = Jun 30 CDT)
      expect(result.creditDateString).toContain('Jun 30');
    });

    it('enrollment overrides maintain their relative order by number', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: { dueDate: '2025-04-01T00:00:00Z' },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      // First enrollment override (number=1, due June 1 UTC = May 31 CDT) should win
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
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
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      expect(result.password).toBe('override-pass');
    });

    it('override can set blockAccess', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({}),
          makeOverrideRule(
            1,
            { blockAccess: true },
            { targetType: 'enrollment', enrollmentIds: ['enroll-1'] },
          ),
        ],
        student: { enrollmentId: 'enroll-1', studentLabelIds: [] },
      });
      expect(result.authorized).toBe(false);
      expect(result.blockAccess).toBe(true);
    });
  });

  describe('PrairieTest integration', () => {
    const prairieTestMainRule: AccessControlRuleInput = {
      rule: {},
      number: 0,
      targetType: 'none',
      enrollmentIds: [],
      studentLabelIds: [],
      prairietestExamUuids: ['exam-uuid-1'],
    };

    const validReservation: PrairieTestReservation = {
      examUuid: 'exam-uuid-1',
      accessEnd: new Date('2025-03-15T14:00:00Z'),
    };

    it('grants access with valid exam reservation', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        authzModeReason: 'PrairieTest',
        prairieTestReservation: validReservation,
      });
      expect(result.authorized).toBe(true);
      expect(result.examAccessEnd).toEqual(validReservation.accessEnd);
    });

    it('denies access when not in exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Public',
        authzModeReason: 'Default',
        prairieTestReservation: validReservation,
      });
      expect(result.authorized).toBe(false);
    });

    it('denies access when reservation UUID does not match', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        authzModeReason: 'PrairieTest',
        prairieTestReservation: {
          examUuid: 'wrong-uuid',
          accessEnd: new Date('2025-03-15T14:00:00Z'),
        },
      });
      expect(result.authorized).toBe(false);
    });

    it('denies access when no reservation exists', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [prairieTestMainRule],
        authzMode: 'Exam',
        authzModeReason: 'PrairieTest',
        prairieTestReservation: null,
      });
      expect(result.authorized).toBe(false);
    });

    it('denies access for non-exam rule when in PrairieTest exam mode', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule()],
        authzMode: 'Exam',
        authzModeReason: 'PrairieTest',
      });
      expect(result.authorized).toBe(false);
    });
  });

  describe('time limit computation', () => {
    it('returns durationMinutes as time limit', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
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
            rule: { dateControl: { durationMinutes: 60, dueDate: '2025-04-01T00:00:00Z' } },
            number: 0,
            targetType: 'none',
            enrollmentIds: [],
            studentLabelIds: [],
            prairietestExamUuids: ['exam-uuid-1'],
          },
        ],
        authzMode: 'Exam',
        authzModeReason: 'PrairieTest',
        prairieTestReservation: {
          examUuid: 'exam-uuid-1',
          accessEnd: new Date('2025-03-15T14:00:00Z'),
        },
      });
      expect(result.timeLimitMin).toBeNull();
    });

    it('clamps time limit to zero when deadline is less than 31 seconds away', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [
          makeMainRule({
            dateControl: {
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
    it('shows assessment when hideQuestions is not set', () => {
      const result = resolveAccessControl({
        ...baseInput,
        rules: [makeMainRule({})],
      });
      expect(result.showClosedAssessment).toBe(true);
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

    it('shows just credit percentage when no deadline', () => {
      const result = resolveAccessControl(baseInput);
      expect(result.creditDateString).toBe('100%');
    });
  });
});

describe('mergeRules', () => {
  it('returns main rule when override is null', () => {
    const main: AccessControlJson = { enabled: true };
    expect(mergeRules(main, null)).toEqual(main);
  });

  it('overrides enabled field', () => {
    const result = mergeRules({ enabled: true }, { enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('overrides blockAccess field', () => {
    const result = mergeRules({}, { blockAccess: true });
    expect(result.blockAccess).toBe(true);
  });

  it('preserves main dateControl fields not in override', () => {
    const result = mergeRules(
      { dateControl: { dueDate: '2025-04-01T00:00:00Z', password: 'secret' } },
      { dateControl: { dueDate: '2025-05-01T00:00:00Z' } },
    );
    expect(result.dateControl?.dueDate).toBe('2025-05-01T00:00:00Z');
    expect(result.dateControl?.password).toBe('secret');
  });

  it('does not mutate main rule', () => {
    const main: AccessControlJson = {
      dateControl: { dueDate: '2025-04-01T00:00:00Z' },
    };
    mergeRules(main, { dateControl: { dueDate: '2025-05-01T00:00:00Z' } });
    expect(main.dateControl?.dueDate).toBe('2025-04-01T00:00:00Z');
  });

  it('sets dateControl from override when main has none', () => {
    const result = mergeRules({}, { dateControl: { dueDate: '2025-05-01T00:00:00Z' } });
    expect(result.dateControl?.dueDate).toBe('2025-05-01T00:00:00Z');
  });

  it('sets afterComplete from override when main has none', () => {
    const result = mergeRules({}, { afterComplete: { hideQuestions: true } });
    expect(result.afterComplete?.hideQuestions).toBe(true);
  });

  it('merges afterComplete fields', () => {
    const result = mergeRules(
      { afterComplete: { hideQuestions: true, hideScore: true } },
      { afterComplete: { hideQuestions: false } },
    );
    expect(result.afterComplete?.hideQuestions).toBe(false);
    expect(result.afterComplete?.hideScore).toBe(true);
  });
});

describe('computeCredit', () => {
  it('returns 100% when dateControl is undefined', () => {
    const result = computeCredit(undefined, new Date(), {}, 'Public');
    expect(result.credit).toBe(100);
    expect(result.active).toBe(true);
  });

  it('returns 100% when dateControl.enabled is false', () => {
    const result = computeCredit(
      { enabled: false, dueDate: '2020-01-01T00:00:00Z' },
      new Date('2025-01-01T00:00:00Z'),
      {},
      'Public',
    );
    expect(result.credit).toBe(100);
    expect(result.active).toBe(true);
  });

  it('returns password from dateControl', () => {
    const result = computeCredit(
      { password: 'test-pw', dueDate: '2025-06-01T00:00:00Z' },
      new Date('2025-03-15T00:00:00Z'),
      {},
      'Public',
    );
    expect(result.password).toBe('test-pw');
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

  it('returns true when past show-again date', () => {
    expect(resolveVisibility(true, '2025-03-10T00:00:00Z', undefined, now)).toBe(true);
  });

  it('returns false when before show-again date', () => {
    expect(resolveVisibility(true, '2025-03-20T00:00:00Z', undefined, now)).toBe(false);
  });

  it('returns false when past hide-again date', () => {
    expect(resolveVisibility(true, '2025-03-10T00:00:00Z', '2025-03-14T00:00:00Z', now)).toBe(
      false,
    );
  });

  it('returns true when past show-again but before hide-again', () => {
    expect(resolveVisibility(true, '2025-03-10T00:00:00Z', '2025-03-20T00:00:00Z', now)).toBe(true);
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
