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
  computeQuestionTotalPoints,
  computeZonePointTotals,
  hasPointsMismatch,
  hasZonePointsMismatch,
  normalizeQuestionPoints,
  questionDisplayName,
} from './questions.js';

describe('compactPoints', () => {
  it('returns empty string for empty array', () => {
    expect(compactPoints([])).toBe('');
  });

  it('returns single value for single-element array', () => {
    expect(compactPoints([10])).toBe('10');
  });

  it('joins distinct values with commas', () => {
    expect(compactPoints([10, 5, 3])).toBe('10, 5, 3');
  });

  it('does not collapse runs of 2', () => {
    expect(compactPoints([10, 10])).toBe('10, 10');
  });

  it('collapses runs of 3 or more', () => {
    expect(compactPoints([10, 10, 10])).toBe('10\u00d73');
  });

  it('collapses mixed runs', () => {
    expect(compactPoints([10, 10, 10, 5, 5])).toBe('10\u00d73, 5, 5');
  });

  it('handles multiple collapsed runs', () => {
    expect(compactPoints([10, 10, 10, 5, 5, 5])).toBe('10\u00d73, 5\u00d73');
  });

  it('handles alternating values', () => {
    expect(compactPoints([10, 5, 10, 5])).toBe('10, 5, 10, 5');
  });
});

describe('normalizeQuestionPoints', () => {
  it('converts points to autoPoints when manualPoints is set', () => {
    const question = {
      trackingId: 'test-id',
      id: 'q1',
      points: 10,
      maxPoints: 20,
      manualPoints: 5,
    } as ZoneQuestionBlockForm;

    const result = normalizeQuestionPoints(question);

    expect(result.autoPoints).toBe(10);
    expect(result.points).toBeUndefined();
    expect(result.maxAutoPoints).toBe(20);
    expect(result.maxPoints).toBeUndefined();
  });

  it('leaves points unchanged when manualPoints is not set', () => {
    const question = {
      trackingId: 'test-id',
      id: 'q1',
      points: 10,
      maxPoints: 20,
    } as ZoneQuestionBlockForm;

    const result = normalizeQuestionPoints(question);

    expect(result.points).toBe(10);
    expect(result.autoPoints).toBeUndefined();
  });
});

describe('questionDisplayName', () => {
  const baseCourse = { id: 'course-1', sharing_name: 'shared-course' } as StaffCourse;

  it('returns QID for questions in the same course', () => {
    const questionRow = {
      question: { qid: 'my-question', course_id: 'course-1' },
      course: { sharing_name: 'other-course' },
    } as StaffAssessmentQuestionRow;

    const result = questionDisplayName(baseCourse, questionRow);

    expect(result).toBe('my-question');
  });

  it('returns prefixed QID for shared questions from other courses', () => {
    const questionRow = {
      question: { qid: 'shared-question', course_id: 'other-course-id' },
      course: { sharing_name: 'external-course' },
    } as StaffAssessmentQuestionRow;

    const result = questionDisplayName(baseCourse, questionRow);

    expect(result).toBe('@external-course/shared-question');
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
        alternative_group: {
          number: 1,
          id: 'ag1',
          json_has_alternatives: false,
          number_choose: 1,
        },
        assessment_question: { number: 1 },
        start_new_alternative_group: true,
      } as StaffAssessmentQuestionRow,
      {
        question: { qid: 'q2', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_group: {
          number: 2,
          id: 'ag2',
          json_has_alternatives: false,
          number_choose: 1,
        },
        assessment_question: { number: 2 },
        start_new_alternative_group: true,
      } as StaffAssessmentQuestionRow,
    ];

    const result = buildHierarchicalAssessment(course, rows);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Zone 1');
    expect(result[0].questions).toHaveLength(2);
    expect(result[0].questions[0].id).toBe('q1');
    expect(result[0].questions[1].id).toBe('q2');
  });

  it('groups alternatives within the same alternative group', () => {
    const rows: StaffAssessmentQuestionRow[] = [
      {
        question: { qid: 'alt1', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_group: {
          number: 1,
          json_has_alternatives: true,
          number_choose: 1,
        },
        assessment_question: { number: 1, number_in_alternative_group: 1 },
        start_new_alternative_group: true,
      } as StaffAssessmentQuestionRow,
      {
        question: { qid: 'alt2', course_id: 'course-1' },
        course: { sharing_name: 'test' },
        zone: { number: 1, title: 'Zone 1' },
        alternative_group: {
          number: 1,
          json_has_alternatives: true,
          number_choose: 1,
        },
        assessment_question: { number: 2, number_in_alternative_group: 2 },
        start_new_alternative_group: false,
      } as StaffAssessmentQuestionRow,
    ];

    const result = buildHierarchicalAssessment(course, rows);

    expect(result).toHaveLength(1);
    expect(result[0].questions).toHaveLength(1);
    expect(result[0].questions[0].alternatives).toHaveLength(2);
    expect(result[0].questions[0].alternatives![0].id).toBe('alt1');
    expect(result[0].questions[0].alternatives![1].id).toBe('alt2');
  });
});

describe('computeQuestionTotalPoints', () => {
  it('returns points for Homework with points only', () => {
    expect(computeQuestionTotalPoints({ points: 10 }, 'Homework')).toBe(10);
  });

  it('returns maxAutoPoints + manualPoints for Homework', () => {
    expect(computeQuestionTotalPoints({ maxAutoPoints: 6, manualPoints: 4 }, 'Homework')).toBe(10);
  });

  it('falls back to autoPoints when maxAutoPoints is not set for Homework', () => {
    expect(computeQuestionTotalPoints({ autoPoints: 6, manualPoints: 4 }, 'Homework')).toBe(10);
  });

  it('returns maxPoints for Homework', () => {
    expect(computeQuestionTotalPoints({ maxPoints: 10 }, 'Homework')).toBe(10);
  });

  it('returns first element of points array + manualPoints for Exam', () => {
    expect(computeQuestionTotalPoints({ points: [4, 3, 2], manualPoints: 4 }, 'Exam')).toBe(8);
  });

  it('returns first element of points array + manualPoints for Exam (uniform)', () => {
    expect(computeQuestionTotalPoints({ points: [3, 3, 3], manualPoints: 5 }, 'Exam')).toBe(8);
  });

  it('inherits points from parent when question has none', () => {
    expect(computeQuestionTotalPoints({}, 'Homework', { points: 10 })).toBe(10);
  });
});

describe('hasPointsMismatch', () => {
  it('returns false for same totals with different representations', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1', points: 10 },
      { trackingId: 't2', id: 'q2', autoPoints: 6, manualPoints: 4 },
    ] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework')).toBe(false);
  });

  it('returns true for different totals', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1', points: 10 },
      { trackingId: 't2', id: 'q2', points: 5 },
    ] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework')).toBe(true);
  });

  it('returns false for a single alternative', () => {
    const alternatives = [{ trackingId: 't1', id: 'q1', points: 10 }] as QuestionAlternativeForm[];
    expect(hasPointsMismatch(alternatives, 'Homework')).toBe(false);
  });

  it('uses parent points when alternatives have none', () => {
    const alternatives = [
      { trackingId: 't1', id: 'q1' },
      { trackingId: 't2', id: 'q2' },
    ] as QuestionAlternativeForm[];
    const parent = { points: 10 };
    expect(hasPointsMismatch(alternatives, 'Homework', parent)).toBe(false);
  });
});

describe('hasZonePointsMismatch', () => {
  it('returns false when zone has no bestQuestions or numberChoose', () => {
    const zone = {
      trackingId: 'z1',
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
      ],
    } as ZoneAssessmentForm;
    expect(hasZonePointsMismatch(zone, 'Homework')).toBe(false);
  });

  it('returns false when all blocks have same total with numberChoose', () => {
    const zone = {
      trackingId: 'z1',
      numberChoose: 2,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', autoPoints: 6, manualPoints: 4 },
      ],
    } as ZoneAssessmentForm;
    expect(hasZonePointsMismatch(zone, 'Homework')).toBe(false);
  });

  it('returns true when blocks differ with bestQuestions', () => {
    const zone = {
      trackingId: 'z1',
      bestQuestions: 1,
      questions: [
        { trackingId: 'q1', id: 'q1', points: 10 },
        { trackingId: 'q2', id: 'q2', points: 5 },
      ],
    } as ZoneAssessmentForm;
    expect(hasZonePointsMismatch(zone, 'Homework')).toBe(true);
  });

  it('returns false when zone has only one question', () => {
    const zone = {
      trackingId: 'z1',
      bestQuestions: 1,
      questions: [{ trackingId: 'q1', id: 'q1', points: 10 }],
    } as ZoneAssessmentForm;
    expect(hasZonePointsMismatch(zone, 'Homework')).toBe(false);
  });
});

describe('computeZonePointTotals', () => {
  it('sums all blocks when no bestQuestions or numberChoose', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', points: 10 },
      { trackingId: 'q2', id: 'q2', points: 5 },
      { trackingId: 'q3', id: 'q3', points: 3 },
    ] as ZoneQuestionBlockForm[];
    const result = computeZonePointTotals(questions);
    expect(result.autoPoints).toBe(18);
    expect(result.manualPoints).toBe(0);
  });

  it('selects best N blocks when bestQuestions is set', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', points: 10 },
      { trackingId: 'q2', id: 'q2', points: 5 },
      { trackingId: 'q3', id: 'q3', points: 3 },
    ] as ZoneQuestionBlockForm[];
    const result = computeZonePointTotals(questions, { bestQuestions: 2 });
    expect(result.autoPoints).toBe(15);
    expect(result.manualPoints).toBe(0);
  });

  it('selects best N blocks when numberChoose is set', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', points: 3 },
      { trackingId: 'q2', id: 'q2', points: 7 },
      { trackingId: 'q3', id: 'q3', points: 5 },
    ] as ZoneQuestionBlockForm[];
    const result = computeZonePointTotals(questions, { numberChoose: 1 });
    expect(result.autoPoints).toBe(7);
    expect(result.manualPoints).toBe(0);
  });

  it('handles bestQuestions with manualPoints', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', autoPoints: 6, manualPoints: 4 },
      { trackingId: 'q2', id: 'q2', autoPoints: 3, manualPoints: 2 },
      { trackingId: 'q3', id: 'q3', autoPoints: 1, manualPoints: 1 },
    ] as ZoneQuestionBlockForm[];
    const result = computeZonePointTotals(questions, { bestQuestions: 2 });
    expect(result.autoPoints).toBe(9);
    expect(result.manualPoints).toBe(6);
  });

  it('returns all blocks when bestQuestions >= number of blocks', () => {
    const questions = [
      { trackingId: 'q1', id: 'q1', points: 10 },
      { trackingId: 'q2', id: 'q2', points: 5 },
    ] as ZoneQuestionBlockForm[];
    const result = computeZonePointTotals(questions, { bestQuestions: 5 });
    expect(result.autoPoints).toBe(15);
    expect(result.manualPoints).toBe(0);
  });
});
