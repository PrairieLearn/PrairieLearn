import { describe, expect, it } from 'vitest';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import {
  buildHierarchicalAssessment,
  compactPoints,
  computeAltPoolChosenRange,
  computeQuestionTotalPoints,
  computeZonePointTotals,
  computeZoneQuestionCount,
  getZoneMixedToolsWarning,
  getZonePointsMismatch,
  hasPointsMismatch,
  normalizeQuestionPoints,
  questionDisplayName,
} from './questions.js';

describe('compactPoints', () => {
  it.each([
    { input: [], expected: '' },
    { input: [10], expected: '10' },
    { input: [10, 5, 3], expected: '10, 5, 3' },
    { input: [10, 10], expected: '10, 10' },
    { input: [10, 10, 10], expected: '10\u00d73' },
    { input: [10, 10, 10, 5, 5], expected: '10\u00d73, 5, 5' },
    { input: [10, 10, 10, 5, 5, 5], expected: '10\u00d73, 5\u00d73' },
    { input: [10, 5, 10, 5], expected: '10, 5, 10, 5' },
  ])('compactPoints($input) === $expected', ({ input, expected }) => {
    expect(compactPoints(input)).toBe(expected);
  });
});

describe('normalizeQuestionPoints', () => {
  it('converts points to autoPoints when manualPoints is set', () => {
    const result = normalizeQuestionPoints({
      trackingId: 'test-id',
      id: 'q1',
      points: 10,
      maxPoints: 20,
      manualPoints: 5,
    } as ZoneQuestionBlockForm);

    expect(result.autoPoints).toBe(10);
    expect(result.points).toBeUndefined();
    expect(result.maxAutoPoints).toBe(20);
    expect(result.maxPoints).toBeUndefined();
  });

  it('leaves points unchanged when manualPoints is not set', () => {
    const result = normalizeQuestionPoints({
      trackingId: 'test-id',
      id: 'q1',
      points: 10,
      maxPoints: 20,
    } as ZoneQuestionBlockForm);

    expect(result.points).toBe(10);
    expect(result.autoPoints).toBeUndefined();
  });
});

describe('questionDisplayName', () => {
  const baseCourse = { id: 'course-1', sharing_name: 'shared-course' } as StaffCourse;

  it.each([
    {
      name: 'same course',
      row: {
        question: { qid: 'my-question', course_id: 'course-1' },
        course: { sharing_name: 'other-course' },
      },
      expected: 'my-question',
    },
    {
      name: 'shared question from other course',
      row: {
        question: { qid: 'shared-question', course_id: 'other-course-id' },
        course: { sharing_name: 'external-course' },
      },
      expected: '@external-course/shared-question',
    },
  ])('returns $expected for $name', ({ row, expected }) => {
    expect(questionDisplayName(baseCourse, row as StaffAssessmentQuestionRow)).toBe(expected);
  });
});

describe('buildHierarchicalAssessment', () => {
  const course = { id: 'course-1' } as StaffCourse;

  it('builds zones with questions from flat rows', () => {
    const rows: StaffAssessmentQuestionRow[] = [
      {
        question: { qid: 'q1', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_pool: {
          number: 1,
          id: 'ag1',
          json_has_alternatives: false,
          number_choose: 1,
        },
        assessment_question: { number: 1 },
        start_new_alternative_pool: true,
      } as StaffAssessmentQuestionRow,
      {
        question: { qid: 'q2', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_pool: {
          number: 2,
          id: 'ag2',
          json_has_alternatives: false,
          number_choose: 1,
        },
        assessment_question: { number: 2 },
        start_new_alternative_pool: true,
      } as StaffAssessmentQuestionRow,
    ];

    const result = buildHierarchicalAssessment(course, rows);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Zone 1');
    expect(result[0].questions).toHaveLength(2);
    expect(result[0].questions[0].id).toBe('q1');
    expect(result[0].questions[1].id).toBe('q2');
  });

  it('collects alternatives within the same alternative pool', () => {
    const rows: StaffAssessmentQuestionRow[] = [
      {
        question: { qid: 'alt1', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_pool: {
          number: 1,
          json_has_alternatives: true,
          number_choose: 1,
        },
        assessment_question: { number: 1, number_in_alternative_group: 1 },
        start_new_alternative_pool: true,
      } as StaffAssessmentQuestionRow,
      {
        question: { qid: 'alt2', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_pool: {
          number: 1,
          json_has_alternatives: true,
          number_choose: 1,
        },
        assessment_question: { number: 2, number_in_alternative_group: 2 },
        start_new_alternative_pool: false,
      } as StaffAssessmentQuestionRow,
    ];

    const result = buildHierarchicalAssessment(course, rows);

    expect(result).toHaveLength(1);
    expect(result[0].questions).toHaveLength(1);
    expect(result[0].questions[0].alternatives).toHaveLength(2);
    expect(result[0].questions[0].alternatives![0].id).toBe('alt1');
    expect(result[0].questions[0].alternatives![1].id).toBe('alt2');
  });

  it('preserves zone overrides and standalone question comments', () => {
    const rows: StaffAssessmentQuestionRow[] = [
      {
        question: { qid: 'q1', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: {
          number: 1,
          title: 'Zone 1',
          json_allow_real_time_grading: false,
        },
        alternative_pool: {
          number: 1,
          id: 'ag1',
          json_has_alternatives: false,
          number_choose: 1,
          json_allow_real_time_grading: false,
        },
        assessment_question: {
          number: 1,
          json_comment: { note: 'standalone question comment' },
        },
        start_new_alternative_pool: true,
      } as unknown as StaffAssessmentQuestionRow,
    ];

    const result = buildHierarchicalAssessment(course, rows);

    expect(result[0].allowRealTimeGrading).toBe(false);
    expect(result[0].questions[0].allowRealTimeGrading).toBe(false);
    expect(result[0].questions[0].comment).toEqual({
      note: 'standalone question comment',
    });
  });
});

describe('computeQuestionTotalPoints', () => {
  it.each([
    { name: 'points for Homework', input: { points: 10 }, type: 'Homework' as const, expected: 10 },
    {
      name: 'maxAutoPoints + manualPoints for Homework',
      input: { maxAutoPoints: 6, manualPoints: 4 },
      type: 'Homework' as const,
      expected: 10,
    },
    {
      name: 'autoPoints fallback for Homework',
      input: { autoPoints: 6, manualPoints: 4 },
      type: 'Homework' as const,
      expected: 10,
    },
    {
      name: 'maxPoints for Homework',
      input: { maxPoints: 10 },
      type: 'Homework' as const,
      expected: 10,
    },
    {
      name: 'points array + manualPoints for Exam',
      input: { points: [4, 3, 2], manualPoints: 4 },
      type: 'Exam' as const,
      expected: 8,
    },
    {
      name: 'uniform points array + manualPoints for Exam',
      input: { points: [3, 3, 3], manualPoints: 5 },
      type: 'Exam' as const,
      expected: 8,
    },
  ])('$name → $expected', ({ input, type, expected }) => {
    expect(computeQuestionTotalPoints(input, type)).toBe(expected);
  });

  it('inherits points from parent when question has none', () => {
    expect(computeQuestionTotalPoints({}, 'Homework', { points: 10 })).toBe(10);
  });
});

describe('hasPointsMismatch', () => {
  it.each([
    {
      name: 'same totals with different representations',
      alternatives: [
        { trackingId: 't1', id: 'q1', points: 10 },
        { trackingId: 't2', id: 'q2', autoPoints: 6, manualPoints: 4 },
      ],
      expected: false,
    },
    {
      name: 'different totals without numberChoose (all selected)',
      alternatives: [
        { trackingId: 't1', id: 'q1', points: 10 },
        { trackingId: 't2', id: 'q2', points: 5 },
      ],
      expected: false,
    },
    {
      name: 'single alternative',
      alternatives: [{ trackingId: 't1', id: 'q1', points: 10 }],
      expected: false,
    },
  ])('returns $expected for $name', ({ alternatives, expected }) => {
    expect(hasPointsMismatch(alternatives as QuestionAlternativeForm[], 'Homework')).toBe(expected);
  });

  it('uses parent points when alternatives have none', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1' },
      { trackingId: 't2', id: 'q2' },
    ] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework', { points: 10 })).toBe(false);
  });

  it('returns false when numberChoose >= alternatives (all selected)', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1', points: 10 },
      { trackingId: 't2', id: 'q2', points: 5 },
    ] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework', { numberChoose: 2 })).toBe(false);
  });

  it('returns true when numberChoose < alternatives with different points', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1', points: 10 },
      { trackingId: 't2', id: 'q2', points: 5 },
      { trackingId: 't3', id: 'q3', points: 10 },
    ] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework', { numberChoose: 2 })).toBe(true);
  });
});

describe('getZonePointsMismatch', () => {
  it.each([
    {
      name: 'no bestQuestions or numberChoose',
      zone: {
        trackingId: 'z1',
        questions: [
          { trackingId: 'q1', id: 'q1', points: 10 },
          { trackingId: 'q2', id: 'q2', points: 5 },
        ],
      },
    },
    {
      name: 'same totals with numberChoose',
      zone: {
        trackingId: 'z1',
        numberChoose: 2,
        questions: [
          { trackingId: 'q1', id: 'q1', points: 10 },
          { trackingId: 'q2', id: 'q2', autoPoints: 6, manualPoints: 4 },
        ],
      },
    },
    {
      name: 'only one question',
      zone: {
        trackingId: 'z1',
        bestQuestions: 1,
        questions: [{ trackingId: 'q1', id: 'q1', points: 10 }],
      },
    },
    {
      name: 'different points but numberChoose >= question count',
      zone: {
        trackingId: 'z1',
        numberChoose: 3,
        questions: [
          { trackingId: 'q1', id: 'q1', points: 10 },
          { trackingId: 'q2', id: 'q2', points: 5 },
          { trackingId: 'q3', id: 'q3', points: 3 },
        ],
      },
    },
    {
      name: 'different points but bestQuestions >= question count',
      zone: {
        trackingId: 'z1',
        bestQuestions: 2,
        questions: [
          { trackingId: 'q1', id: 'q1', points: 10 },
          { trackingId: 'q2', id: 'q2', points: 5 },
        ],
      },
    },
  ])('returns null when $name', ({ zone }) => {
    expect(getZonePointsMismatch(zone as ZoneAssessmentForm, 'Homework')).toBeNull();
  });

  it('warns about random selection when numberChoose < question count', () => {
    const zone = {
      trackingId: 'z1',
      numberChoose: 1,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
      ],
    };
    const result = getZonePointsMismatch(zone as ZoneAssessmentForm, 'Homework');
    expect(result?.label).toBe('Inconsistent points');
    expect(result?.body).toContain('randomly selects');
  });

  it('warns about best-scoring when bestQuestions < question count', () => {
    const zone = {
      trackingId: 'z1',
      bestQuestions: 1,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
      ],
    };
    const result = getZonePointsMismatch(zone as ZoneAssessmentForm, 'Homework');
    expect(result?.label).toBe('Inconsistent points');
    expect(result?.body).toContain('best-scoring');
  });

  it('warns about both when bestQuestions < numberChoose (numberChoose covers all)', () => {
    const zone = {
      trackingId: 'z1',
      numberChoose: 3,
      bestQuestions: 2,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
        { trackingId: 'q3', id: 'q3', points: 3 },
      ],
    };
    const result = getZonePointsMismatch(zone as ZoneAssessmentForm, 'Homework');
    expect(result?.label).toBe('Inconsistent points');
    expect(result?.body).toContain('best-scoring');
  });

  it('warns about both when numberChoose and bestQuestions are both active', () => {
    const zone = {
      trackingId: 'z1',
      numberChoose: 3,
      bestQuestions: 2,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
        { trackingId: 'q3', id: 'q3', points: 3 },
        { trackingId: 'q4', id: 'q4', points: 7 },
      ],
    };
    const result = getZonePointsMismatch(zone as ZoneAssessmentForm, 'Homework');
    expect(result?.label).toBe('Inconsistent points');
    expect(result?.body).toContain('randomly selects');
    expect(result?.body).toContain('best-scoring');
  });
});

describe('computeZonePointTotals', () => {
  it.each([
    {
      name: 'sums all blocks with no options',
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
        { trackingId: 'q3', id: 'q3', points: 3 },
      ],
      opts: undefined,
      expectedAuto: 18,
      expectedManual: 0,
    },
    {
      name: 'selects best N blocks with bestQuestions',
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
        { trackingId: 'q3', id: 'q3', points: 3 },
      ],
      opts: { bestQuestions: 2 },
      expectedAuto: 15,
      expectedManual: 0,
    },
    {
      name: 'selects best N blocks with numberChoose',
      questions: [
        { trackingId: 'q1', id: 'q1', points: 3 },
        { trackingId: 'q2', id: 'q2', points: 7 },
        { trackingId: 'q3', id: 'q3', points: 5 },
      ],
      opts: { numberChoose: 1 },
      expectedAuto: 7,
      expectedManual: 0,
    },
    {
      name: 'handles bestQuestions with manualPoints',
      questions: [
        { trackingId: 'q1', id: 'q1', autoPoints: 6, manualPoints: 4 },
        { trackingId: 'q2', id: 'q2', autoPoints: 3, manualPoints: 2 },
        { trackingId: 'q3', id: 'q3', autoPoints: 1, manualPoints: 1 },
      ],
      opts: { bestQuestions: 2 },
      expectedAuto: 9,
      expectedManual: 6,
    },
    {
      name: 'returns all blocks when bestQuestions >= count',
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
      ],
      opts: { bestQuestions: 5 },
      expectedAuto: 15,
      expectedManual: 0,
    },
    {
      name: 'caps alt pool numberChoose at alternatives.length',
      questions: [
        {
          trackingId: 'q1',
          numberChoose: 5,
          alternatives: [
            { trackingId: 'a1', id: 'q1', points: 10 },
            { trackingId: 'a2', id: 'q2', points: 8 },
          ],
        },
      ],
      opts: undefined,
      expectedAuto: 18,
      expectedManual: 0,
    },
  ])('$name', ({ questions, opts, expectedAuto, expectedManual }) => {
    const result = computeZonePointTotals(questions as ZoneQuestionBlockForm[], opts);
    expect(result.autoPoints).toBe(expectedAuto);
    expect(result.manualPoints).toBe(expectedManual);
  });

  it('uses maxAutoPoints cap for Homework questions', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', autoPoints: 1, maxAutoPoints: 5 },
      { trackingId: 'q2', id: 'q2', autoPoints: 2, maxAutoPoints: 8 },
    ] as ZoneQuestionBlockForm[];

    const result = computeZonePointTotals(questions);
    expect(result.autoPoints).toBe(13);
  });

  it('uses maxPoints cap when maxAutoPoints is absent', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', points: 1, maxPoints: 5 },
    ] as ZoneQuestionBlockForm[];

    const result = computeZonePointTotals(questions);
    expect(result.autoPoints).toBe(5);
  });

  it('uses maxAutoPoints cap for alternatives within an alt pool', () => {
    const questions = [
      {
        trackingId: 'q1',
        autoPoints: 1,
        maxAutoPoints: 5,
        numberChoose: 1,
        alternatives: [
          { trackingId: 'a1', id: 'q1' },
          { trackingId: 'a2', id: 'q2', autoPoints: 2, maxAutoPoints: 10 },
        ],
      },
    ] as ZoneQuestionBlockForm[];

    const result = computeZonePointTotals(questions);
    // Alternative a2 overrides with max 10; a1 inherits pool max 5.
    // numberChoose=1, so pick the best = 10.
    expect(result.autoPoints).toBe(10);
  });
});

describe('computeZoneQuestionCount', () => {
  it.each([
    {
      name: 'single questions count as 1 each',
      questions: [
        { trackingId: 'q1', id: 'q1' },
        { trackingId: 'q2', id: 'q2' },
      ],
      expected: 2,
    },
    {
      name: 'uses numberChoose for alt pools',
      questions: [
        {
          trackingId: 'q1',
          numberChoose: 2,
          alternatives: [
            { trackingId: 'a1', id: 'q1' },
            { trackingId: 'a2', id: 'q2' },
            { trackingId: 'a3', id: 'q3' },
          ],
        },
      ],
      expected: 2,
    },
    {
      name: 'caps numberChoose at alternatives.length',
      questions: [
        {
          trackingId: 'q1',
          numberChoose: 5,
          alternatives: [
            { trackingId: 'a1', id: 'q1' },
            { trackingId: 'a2', id: 'q2' },
          ],
        },
      ],
      expected: 2,
    },
  ])('$name → $expected', ({ questions, expected }) => {
    expect(computeZoneQuestionCount(questions as ZoneQuestionBlockForm[])).toBe(expected);
  });

  it('counts questions in zone with mixed questions and alternative pools', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1' },
      {
        trackingId: 'q2',
        numberChoose: 2,
        alternatives: [
          { trackingId: 'a1', id: 'q2' },
          { trackingId: 'a2', id: 'q3' },
          { trackingId: 'a3', id: 'q4' },
        ],
      },
    ];
    expect(computeZoneQuestionCount(questions as ZoneQuestionBlockForm[])).toBe(3);
  });
});

describe('getZoneMixedToolsWarning', () => {
  function makeZone(
    trackingId: string,
    tools?: Record<string, { enabled: boolean }>,
  ): ZoneAssessmentForm {
    return { trackingId, questions: [], tools } as unknown as ZoneAssessmentForm;
  }

  it('returns null for a single zone', () => {
    const zone = makeZone('z1');
    expect(
      getZoneMixedToolsWarning({ zone, zones: [zone], assessmentToolDefaults: {} }),
    ).toBeNull();
  });

  it('returns null when all zones inherit the same default', () => {
    const z1 = makeZone('z1');
    const z2 = makeZone('z2');
    const zones = [z1, z2];
    expect(
      getZoneMixedToolsWarning({ zone: z2, zones, assessmentToolDefaults: { calculator: true } }),
    ).toBeNull();
  });

  it('warns when a tool is enabled in an earlier zone and disabled in a later zone', () => {
    const z1 = makeZone('z1', { calculator: { enabled: true } });
    const z2 = makeZone('z2', { calculator: { enabled: false } });
    const zones = [z1, z2];
    const result = getZoneMixedToolsWarning({ zone: z2, zones, assessmentToolDefaults: {} });
    expect(result).toContain('Calculator');
    expect(result).toContain('earlier zone');
  });

  it('does not warn for the zone where the tool is enabled', () => {
    const z1 = makeZone('z1', { calculator: { enabled: true } });
    const z2 = makeZone('z2', { calculator: { enabled: false } });
    const zones = [z1, z2];
    expect(getZoneMixedToolsWarning({ zone: z1, zones, assessmentToolDefaults: {} })).toBeNull();
  });

  it('returns null when tool is disabled in earlier zone and enabled in later zone', () => {
    const z1 = makeZone('z1', { calculator: { enabled: false } });
    const z2 = makeZone('z2', { calculator: { enabled: true } });
    const zones = [z1, z2];
    expect(getZoneMixedToolsWarning({ zone: z2, zones, assessmentToolDefaults: {} })).toBeNull();
  });

  it('warns when assessment default is enabled and a later zone disables it', () => {
    const z1 = makeZone('z1');
    const z2 = makeZone('z2', { calculator: { enabled: false } });
    const zones = [z1, z2];
    const result = getZoneMixedToolsWarning({
      zone: z2,
      zones,
      assessmentToolDefaults: { calculator: true },
    });
    expect(result).toContain('Calculator');
  });

  it('returns null when assessment default is disabled and no zone enables it', () => {
    const z1 = makeZone('z1');
    const z2 = makeZone('z2');
    const zones = [z1, z2];
    expect(
      getZoneMixedToolsWarning({ zone: z2, zones, assessmentToolDefaults: { calculator: false } }),
    ).toBeNull();
  });
});

describe('computeAltPoolChosenRange', () => {
  function makeAlt(id: string) {
    return { trackingId: id, id } as ZoneQuestionBlockForm;
  }

  function makeAltPool(id: string, altCount: number, numberChoose?: number) {
    return {
      trackingId: id,
      numberChoose,
      alternatives: Array.from({ length: altCount }, (_, i) => ({
        trackingId: `${id}-a${i}`,
        id: `${id}-q${i}`,
      })),
    } as ZoneQuestionBlockForm;
  }

  it.each([
    { name: 'no zone numberChoose', zoneChoose: undefined, poolChoose: 2, alts: 3, expected: 2 },
    { name: 'zone numberChoose >= effective', zoneChoose: 3, poolChoose: 2, alts: 3, expected: 2 },
    { name: 'zone numberChoose < effective', zoneChoose: 2, poolChoose: 3, alts: 3, expected: 2 },
    {
      name: 'null pool numberChoose (all)',
      zoneChoose: undefined,
      poolChoose: undefined,
      alts: 3,
      expected: 3,
    },
    { name: 'empty alt pool', zoneChoose: 2, poolChoose: undefined, alts: 0, expected: 0 },
  ])('single pool: $name -> min=max=$expected', ({ zoneChoose, poolChoose, alts, expected }) => {
    const pool = makeAltPool('ag1', alts, poolChoose);
    const zone = {
      trackingId: 'z1',
      numberChoose: zoneChoose,
      questions: [pool],
    } as ZoneAssessmentForm;
    expect(computeAltPoolChosenRange(zone, pool)).toEqual({ min: expected, max: expected });
  });

  it('spreads evenly across multiple alt pools, producing a range', () => {
    // Two pools each effective=2, zone picks 3 of 4.
    // Layer 1: 2 questions, layer 2: 2 questions. C=[0,2,4].
    // guaranteed=1 (C[1]=2 <= 3), max=2 (has layer 2 and 3 > C[1]).
    const pool1 = makeAltPool('ag1', 2, 2);
    const pool2 = makeAltPool('ag2', 2, 2);
    const zone = {
      trackingId: 'z1',
      numberChoose: 3,
      questions: [pool1, pool2],
    } as ZoneAssessmentForm;

    expect(computeAltPoolChosenRange(zone, pool1)).toEqual({ min: 1, max: 2 });
    expect(computeAltPoolChosenRange(zone, pool2)).toEqual({ min: 1, max: 2 });
  });

  it('caps alt pool at guaranteed when zone budget is exhausted by layer 1', () => {
    // Standalone(1) + alt pool(effective=2). Zone picks 2.
    // Layer 1: 2 items. C=[0,2,3]. Z=2.
    // For alt pool: guaranteed=1 (C[1]=2 <= 2), no budget left → max=1.
    const standalone = makeAlt('q1');
    const pool = makeAltPool('ag1', 2, 2);
    const zone = {
      trackingId: 'z1',
      numberChoose: 2,
      questions: [standalone, pool],
    } as ZoneAssessmentForm;

    expect(computeAltPoolChosenRange(zone, pool)).toEqual({ min: 1, max: 1 });
  });
});
