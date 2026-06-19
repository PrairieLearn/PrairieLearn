import { describe, expect, it } from 'vitest';

import {
  type AccessControlFormData,
  type DefaultRuleData,
  type OverrideData,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToDefaultRuleFormData,
  jsonToOverrideFormData,
} from './types.js';

const TEST_TIMEZONE = 'America/Chicago';

const defaultRuleFixture: DefaultRuleData = {
  trackingId: 'default-1',
  beforeReleaseListed: true,
  dateControlEnabled: true,
  release: { date: '2025-03-01T00:00:00Z', released: true },
  due: { date: '2025-04-01T00:00:00Z', credit: null, customCredit: false },
  earlyDeadlines: [{ date: '2025-03-15T00:00:00Z', credit: 110 }],
  lateDeadlines: [{ date: '2025-04-15T00:00:00Z', credit: 50 }],
  afterLastDeadline: { allowSubmissions: false },
  durationMinutes: 60,
  password: 'secret',
  prairieTestExams: [],
  questionVisibility: { hidden: true },
  scoreVisibility: { hidden: false },
};

const baseOverride: OverrideData = {
  uuid: '11111111-1111-4111-8111-111111111111',
  trackingId: 'o-base',
  appliesTo: {
    targetType: 'enrollment',
    enrollments: [{ enrollmentId: 'e-0', uid: 'a@b.com', name: 'A' }],
    studentLabels: [],
  },
  overriddenFields: [],
  release: { date: null, released: true },
  due: { date: null, credit: null, customCredit: false },
  earlyDeadlines: [],
  lateDeadlines: [],
  afterLastDeadline: { allowSubmissions: false },
  durationMinutes: null,
  password: null,
  questionVisibility: { hidden: true },
  scoreVisibility: { hidden: false },
};

function buildFormData(override: OverrideData): AccessControlFormData {
  return { defaultRule: defaultRuleFixture, overrides: [override] };
}

describe('jsonToDefaultRuleFormData', () => {
  it('defaults release.date to null when dateControl is not configured', () => {
    const defaultRule = jsonToDefaultRuleFormData({}, TEST_TIMEZONE);
    expect(defaultRule.release.date).toBeNull();
  });

  it('defaults release.released to true for unconfigured release', () => {
    const defaultRule = jsonToDefaultRuleFormData({}, TEST_TIMEZONE);
    expect(defaultRule.release.released).toBe(true);
  });

  it('initializes release.released = true when stored date is in the past', () => {
    const defaultRule = jsonToDefaultRuleFormData(
      { dateControl: { release: { date: '2000-01-01T00:00:00Z' }, due: { date: null } } },
      TEST_TIMEZONE,
    );
    expect(defaultRule.release.released).toBe(true);
  });

  it('initializes release.released = false when stored date is far in the future', () => {
    const defaultRule = jsonToDefaultRuleFormData(
      { dateControl: { release: { date: '2099-01-01T00:00:00Z' }, due: { date: null } } },
      TEST_TIMEZONE,
    );
    expect(defaultRule.release.released).toBe(false);
  });

  it('defaults hidden to true for questions when afterComplete is not configured', () => {
    const defaultRule = jsonToDefaultRuleFormData({}, TEST_TIMEZONE);
    expect(defaultRule.questionVisibility.hidden).toBe(true);
  });

  it('defaults hidden to false for score when afterComplete is not configured', () => {
    const defaultRule = jsonToDefaultRuleFormData({}, TEST_TIMEZONE);
    expect(defaultRule.scoreVisibility.hidden).toBe(false);
  });

  it('preserves hidden: false for questions when explicitly set in JSON', () => {
    const defaultRule = jsonToDefaultRuleFormData(
      { afterComplete: { questions: { hidden: false } } },
      TEST_TIMEZONE,
    );
    expect(defaultRule.questionVisibility.hidden).toBe(false);
  });

  it('preserves hidden: true for questions when explicitly set in JSON', () => {
    const defaultRule = jsonToDefaultRuleFormData(
      { afterComplete: { questions: { hidden: true } } },
      TEST_TIMEZONE,
    );
    expect(defaultRule.questionVisibility.hidden).toBe(true);
  });
});

describe('formDataToJson', () => {
  it('preserves existing override UUIDs from JSON', () => {
    const formData = jsonToOverrideFormData(
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        labels: ['Section A'],
      },
      TEST_TIMEZONE,
    );

    expect(formData.uuid).toBe('22222222-2222-4222-8222-222222222222');
    expect(formDataToJson(buildFormData(formData))[1].uuid).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('generates UUIDs for existing override JSON without UUIDs', () => {
    const formData = jsonToOverrideFormData(
      {
        labels: ['Section A'],
      },
      TEST_TIMEZONE,
    );

    expect(formData.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(formDataToJson(buildFormData(formData))[1].uuid).toBe(formData.uuid);
  });

  it('generates UUIDs for new override form data', () => {
    const formData = createDefaultOverrideFormData(defaultRuleFixture);

    expect(formData.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(formDataToJson(buildFormData(formData))[1].uuid).toBe(formData.uuid);
  });

  it('defaults beforeReleaseListed to false when omitted from the default rule JSON', () => {
    const defaultRule = jsonToDefaultRuleFormData({}, TEST_TIMEZONE);

    expect(defaultRule.beforeReleaseListed).toBe(false);
  });

  it('does not emit the UI-only release.released flag to JSON', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        release: { date: '2099-01-01T00:00:00Z', released: true },
      },
      overrides: [],
    });

    expect(result[0].dateControl?.release).toEqual({ date: '2099-01-01T00:00:00Z' });
  });

  it('omits default score visibility when only default-rule question visibility is non-default', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        questionVisibility: { hidden: false },
        scoreVisibility: { hidden: false },
      },
      overrides: [],
    });

    expect(result[0].afterComplete).toEqual({
      questions: { hidden: false },
    });
  });

  it('omits `due` on default rules when there is no due date and no custom credit', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        due: { date: null, credit: null, customCredit: false },
      },
      overrides: [],
    });

    expect(result[0].dateControl?.due).toBeUndefined();
  });

  it('emits an explicit null due date on default rules with custom credit', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        due: { date: null, credit: 80, customCredit: true },
      },
      overrides: [],
    });

    expect(result[0].dateControl?.due).toEqual({ date: null, credit: 80 });
  });

  it('omits default afterLastDeadline when submissions are disabled', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        afterLastDeadline: { allowSubmissions: false },
      },
      overrides: [],
    });

    expect(result[0].dateControl?.afterLastDeadline).toBeUndefined();
  });

  it('omits dateControl when no date fields are overridden', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-1',
    };

    const result = formDataToJson(buildFormData(override));
    expect(result[1].dateControl).toBeUndefined();
  });

  it('includes only explicitly overridden date fields', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-2',
      overriddenFields: ['due', 'password'],
      due: { date: '2025-05-01T00:00:00Z', credit: null, customCredit: false },
      password: 'pw',
    };

    const result = formDataToJson(buildFormData(override));
    const dc = result[1].dateControl!;
    expect(dc.due?.date).toBe('2025-05-01T00:00:00Z');
    expect(dc.password).toBe('pw');
    expect('release' in dc).toBe(false);
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
        enrollments: [],
        studentLabels: [
          { studentLabelId: '1', name: 'label-a' },
          { studentLabelId: '2', name: 'label-b' },
        ],
      },
    };

    const overrideJson = formDataToJson(buildFormData(override))[1];
    expect(overrideJson.uuid).toBe('11111111-1111-4111-8111-111111111111');
    expect(overrideJson.labels).toEqual(['label-a', 'label-b']);
    expect(overrideJson.ruleType).toBeUndefined();
    expect(overrideJson.enrollments).toBeUndefined();
  });

  it('serializes enrollment appliesTo with ruleType and enrollments', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-6',
      appliesTo: {
        targetType: 'enrollment',
        enrollments: [{ enrollmentId: 'e-1', uid: 'user@test.com', name: 'Test User' }],
        studentLabels: [],
      },
    };

    const overrideJson = formDataToJson(buildFormData(override))[1];
    expect(overrideJson.uuid).toBe('11111111-1111-4111-8111-111111111111');
    expect(overrideJson.ruleType).toBe('enrollment');
    expect(overrideJson.enrollments).toEqual([
      { enrollmentId: 'e-1', uid: 'user@test.com', name: 'Test User' },
    ]);
    expect(overrideJson.labels).toBeUndefined();
  });

  it('round-trips enrollment appliesTo with no selected students', () => {
    const formData = jsonToOverrideFormData(
      {
        id: '1',
        ruleType: 'enrollment',
        enrollments: [],
      },
      TEST_TIMEZONE,
    );

    expect(formData.appliesTo).toEqual({
      targetType: 'enrollment',
      enrollments: [],
      studentLabels: [],
    });

    const overrideJson = formDataToJson(buildFormData(formData))[1];
    expect(overrideJson.ruleType).toBe('enrollment');
    expect(overrideJson.enrollments).toEqual([]);
    expect(overrideJson.labels).toBeUndefined();
  });

  it('serializes afterComplete visibility overrides', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-7',
      overriddenFields: ['questionVisibility', 'scoreVisibility'],
      questionVisibility: { hidden: true, visibleFromDate: '2025-06-01T00:00:00Z' },
      scoreVisibility: { hidden: true },
    };

    const overrideJson = formDataToJson(buildFormData(override))[1];
    expect(overrideJson.afterComplete).toBeDefined();
    const questions = overrideJson.afterComplete!.questions!;
    expect(questions.hidden).toBe(true);
    expect(questions.visibleFromDate).toBe('2025-06-01T00:00:00Z');
    expect(overrideJson.afterComplete!.score!.hidden).toBe(true);
  });

  it('emits default afterComplete when dateControl is on but no due date, late deadline, or duration is set', () => {
    const result = formDataToJson({
      defaultRule: {
        ...defaultRuleFixture,
        dateControlEnabled: true,
        due: { date: null, credit: null, customCredit: false },
        lateDeadlines: [],
        durationMinutes: null,
        prairieTestExams: [],
        questionVisibility: { hidden: false },
        scoreVisibility: { hidden: true },
      },
      overrides: [],
    });

    expect(result[0].afterComplete).toEqual({
      questions: { hidden: false },
      score: { hidden: true },
    });
  });

  it('omits afterComplete when neither visibility is overridden', () => {
    const override: OverrideData = {
      ...baseOverride,
      trackingId: 'o-8',
    };

    const overrideJson = formDataToJson(buildFormData(override))[1];
    expect(overrideJson.afterComplete).toBeUndefined();
  });

  it('preserves explicit null/empty override removals in dateControl', () => {
    const formData: AccessControlFormData = {
      defaultRule: defaultRuleFixture,
      overrides: [
        {
          ...baseOverride,
          trackingId: 'override-1',
          appliesTo: {
            targetType: 'enrollment',
            enrollments: [{ enrollmentId: 'e-2', uid: 'user@example.com', name: 'Test User' }],
            studentLabels: [],
          },
          overriddenFields: [
            'due',
            'earlyDeadlines',
            'lateDeadlines',
            'afterLastDeadline',
            'durationMinutes',
            'password',
          ],
          // Release date as null is not allowed, so this is false.
          due: { date: null, credit: null, customCredit: false },
          earlyDeadlines: [],
          lateDeadlines: [],
          afterLastDeadline: { allowSubmissions: false },
          durationMinutes: null,
          password: null,
        },
      ],
    };

    const result = formDataToJson(formData);
    const overrideJson = result[1];

    expect(overrideJson.dateControl).toBeDefined();
    const dc = overrideJson.dateControl!;
    expect('due' in dc).toBe(true);
    expect(dc.due?.date).toBeNull();
    expect('earlyDeadlines' in dc).toBe(true);
    expect(dc.earlyDeadlines).toEqual([]);
    expect('lateDeadlines' in dc).toBe(true);
    expect(dc.lateDeadlines).toEqual([]);
    expect('afterLastDeadline' in dc).toBe(true);
    expect(dc.afterLastDeadline).toEqual({ allowSubmissions: false });
    expect('durationMinutes' in dc).toBe(true);
    expect(dc.durationMinutes).toBeNull();
    expect('password' in dc).toBe(true);
    expect(dc.password).toBeNull();
  });

  it('round-trips PrairieTest exams with default afterComplete flags omitted', () => {
    const formData = jsonToDefaultRuleFormData(
      {
        integrations: {
          prairieTest: {
            exams: [{ examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c', readOnly: false }],
          },
        },
      },
      TEST_TIMEZONE,
    );

    expect(formData.prairieTestExams).toEqual([
      {
        examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c',
        readOnly: false,
        afterCompleteQuestionsHidden: false,
        afterCompleteScoreHidden: false,
      },
    ]);

    const json = formDataToJson({ defaultRule: formData, overrides: [] });
    expect(json[0].integrations?.prairieTest?.exams).toEqual([
      { examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' },
    ]);
  });

  it('round-trips PrairieTest exams with afterComplete questions hidden', () => {
    const formData = jsonToDefaultRuleFormData(
      {
        integrations: {
          prairieTest: {
            exams: [
              {
                examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c',
                afterComplete: { questions: { hidden: true } },
              },
            ],
          },
        },
      },
      TEST_TIMEZONE,
    );

    expect(formData.prairieTestExams[0].afterCompleteQuestionsHidden).toBe(true);
    expect(formData.prairieTestExams[0].afterCompleteScoreHidden).toBe(false);

    const json = formDataToJson({ defaultRule: formData, overrides: [] });
    expect(json[0].integrations?.prairieTest?.exams).toEqual([
      {
        examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c',
        afterComplete: { questions: { hidden: true } },
      },
    ]);
  });

  it('round-trips PrairieTest exams with both questions and score hidden', () => {
    const formData = jsonToDefaultRuleFormData(
      {
        integrations: {
          prairieTest: {
            exams: [
              {
                examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c',
                afterComplete: { questions: { hidden: true }, score: { hidden: true } },
              },
            ],
          },
        },
      },
      TEST_TIMEZONE,
    );

    expect(formData.prairieTestExams[0].afterCompleteQuestionsHidden).toBe(true);
    expect(formData.prairieTestExams[0].afterCompleteScoreHidden).toBe(true);

    const json = formDataToJson({ defaultRule: formData, overrides: [] });
    expect(json[0].integrations?.prairieTest?.exams).toEqual([
      {
        examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c',
        afterComplete: { questions: { hidden: true }, score: { hidden: true } },
      },
    ]);
  });

  it('serializes afterLastDeadline overrides', () => {
    const noSubmissions: OverrideData = {
      ...baseOverride,
      trackingId: 'o-ald-0',
      overriddenFields: ['afterLastDeadline'],
      afterLastDeadline: { allowSubmissions: false },
    };
    expect(formDataToJson(buildFormData(noSubmissions))[1].dateControl!.afterLastDeadline).toEqual({
      allowSubmissions: false,
    });

    const practice: OverrideData = {
      ...baseOverride,
      trackingId: 'o-ald-1',
      overriddenFields: ['afterLastDeadline'],
      afterLastDeadline: { allowSubmissions: true, credit: 0 },
    };
    expect(formDataToJson(buildFormData(practice))[1].dateControl!.afterLastDeadline).toEqual({
      allowSubmissions: true,
      credit: 0,
    });

    const partialCredit: OverrideData = {
      ...baseOverride,
      trackingId: 'o-ald-2',
      overriddenFields: ['afterLastDeadline'],
      afterLastDeadline: { allowSubmissions: true, credit: 50 },
    };
    expect(formDataToJson(buildFormData(partialCredit))[1].dateControl!.afterLastDeadline).toEqual({
      allowSubmissions: true,
      credit: 50,
    });
  });
});
