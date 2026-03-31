import { describe, expect, it } from 'vitest';

import {
  type AccessControlFormData,
  type MainRuleData,
  type OverrideData,
  formDataToJson,
  jsonToMainRuleFormData,
} from './types.js';

const TEST_TIMEZONE = 'America/Chicago';

const defaultMainRule: MainRuleData = {
  trackingId: 'main-1',
  listBeforeRelease: true,
  dateControlEnabled: true,
  releaseDate: '2025-03-01T00:00:00Z',
  dueDate: '2025-04-01T00:00:00Z',
  earlyDeadlines: [{ date: '2025-03-15T00:00:00Z', credit: 110 }],
  lateDeadlines: [{ date: '2025-04-15T00:00:00Z', credit: 50 }],
  afterLastDeadline: { credit: 0, allowSubmissions: false },
  durationMinutes: 60,
  password: 'secret',
  prairieTestEnabled: false,
  prairieTestExams: [],
  questionVisibility: { hideQuestions: false },
  scoreVisibility: { hideScore: false },
};

const baseOverride: OverrideData = {
  trackingId: 'o-base',
  appliesTo: {
    targetType: 'individual',
    individuals: [{ uid: 'a@b.com', name: 'A' }],
    studentLabels: [],
  },
  overriddenFields: [],
  releaseDate: null,
  dueDate: null,
  earlyDeadlines: [],
  lateDeadlines: [],
  afterLastDeadline: null,
  durationMinutes: null,
  password: null,
  questionVisibility: { hideQuestions: false },
  scoreVisibility: { hideScore: false },
};

function buildFormData(override: OverrideData): AccessControlFormData {
  return { mainRule: defaultMainRule, overrides: [override] };
}

describe('formDataToJson', () => {
  it('defaults listBeforeRelease to false when omitted from the main rule JSON', () => {
    const mainRule = jsonToMainRuleFormData({}, TEST_TIMEZONE);

    expect(mainRule.listBeforeRelease).toBe(false);
  });

  it('omits dateControl when no date fields are overridden', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-1',
    };

    const result = formDataToJson(buildFormData(override), TEST_TIMEZONE);
    expect(result[1].dateControl).toBeUndefined();
  });

  it('includes only explicitly overridden date fields', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-2',
      overriddenFields: ['dueDate', 'password'],
      dueDate: '2025-05-01T00:00:00Z',
      password: 'pw',
    };

    const result = formDataToJson(buildFormData(override), TEST_TIMEZONE);
    const dc = result[1].dateControl!;
    expect(dc.dueDate).toBe('2025-05-01T00:00:00Z');
    expect(dc.password).toBe('pw');
    expect('releaseDate' in dc).toBe(false);
    expect('earlyDeadlines' in dc).toBe(false);
    expect('lateDeadlines' in dc).toBe(false);
    expect('afterLastDeadline' in dc).toBe(false);
    expect('durationMinutes' in dc).toBe(false);
  });

  it('serializes student_label appliesTo with labels', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-5',
      appliesTo: {
        targetType: 'student_label',
        individuals: [],
        studentLabels: [
          { studentLabelId: '1', name: 'label-a' },
          { studentLabelId: '2', name: 'label-b' },
        ],
      },
    };

    const overrideJson = formDataToJson(buildFormData(override), TEST_TIMEZONE)[1];
    expect(overrideJson.labels).toEqual(['label-a', 'label-b']);
    expect(overrideJson.ruleType).toBeUndefined();
    expect(overrideJson.individuals).toBeUndefined();
  });

  it('serializes individual appliesTo with ruleType and individuals', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-6',
      appliesTo: {
        targetType: 'individual',
        individuals: [{ enrollmentId: 'e-1', uid: 'user@test.com', name: 'Test User' }],
        studentLabels: [],
      },
    };

    const overrideJson = formDataToJson(buildFormData(override), TEST_TIMEZONE)[1];
    expect(overrideJson.ruleType).toBe('enrollment');
    expect(overrideJson.individuals).toEqual([
      { enrollmentId: 'e-1', uid: 'user@test.com', name: 'Test User' },
    ]);
    expect(overrideJson.labels).toBeUndefined();
  });

  it('serializes afterComplete visibility overrides', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-7',
      overriddenFields: ['questionVisibility', 'scoreVisibility'],
      questionVisibility: { hideQuestions: true, showAgainDate: '2025-06-01T00:00:00Z' },
      scoreVisibility: { hideScore: true },
    };

    const overrideJson = formDataToJson(buildFormData(override), TEST_TIMEZONE)[1];
    expect(overrideJson.afterComplete).toBeDefined();
    expect(overrideJson.afterComplete!.hideQuestions).toBe(true);
    expect(overrideJson.afterComplete!.showQuestionsAgainDate).toBe('2025-06-01T00:00:00Z');
    expect(overrideJson.afterComplete!.hideScore).toBe(true);
  });

  it('omits afterComplete when neither visibility is overridden', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-8',
    };

    const overrideJson = formDataToJson(buildFormData(override), TEST_TIMEZONE)[1];
    expect(overrideJson.afterComplete).toBeUndefined();
  });

  it('preserves explicit null/empty override removals in dateControl', () => {
    const formData: AccessControlFormData = {
      mainRule: defaultMainRule,
      overrides: [
        {
          ...baseOverride,
          trackingId: 'override-1',
          appliesTo: {
            targetType: 'individual',
            individuals: [{ uid: 'user@example.com', name: 'Test User' }],
            studentLabels: [],
          },
          overriddenFields: [
            'releaseDate',
            'dueDate',
            'earlyDeadlines',
            'lateDeadlines',
            'afterLastDeadline',
            'durationMinutes',
            'password',
          ],
          releaseDate: null,
          dueDate: null,
          earlyDeadlines: [],
          lateDeadlines: [],
          afterLastDeadline: null,
          durationMinutes: null,
          password: null,
        },
      ],
    };

    const result = formDataToJson(formData, TEST_TIMEZONE);
    const overrideJson = result[1];

    expect(overrideJson.dateControl).toBeDefined();
    const dc = overrideJson.dateControl!;
    expect('releaseDate' in dc).toBe(true);
    expect(dc.releaseDate).toBeNull();
    expect('dueDate' in dc).toBe(true);
    expect(dc.dueDate).toBeNull();
    expect('earlyDeadlines' in dc).toBe(true);
    expect(dc.earlyDeadlines).toEqual([]);
    expect('lateDeadlines' in dc).toBe(true);
    expect(dc.lateDeadlines).toEqual([]);
    expect('afterLastDeadline' in dc).toBe(true);
    expect(dc.afterLastDeadline).toBeNull();
    expect('durationMinutes' in dc).toBe(true);
    expect(dc.durationMinutes).toBeNull();
    expect('password' in dc).toBe(true);
    expect(dc.password).toBeNull();
  });
});
