import { describe, expect, it } from 'vitest';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { ZoneQuestionBlockForm } from '../types.js';

import {
  buildHierarchicalAssessment,
  normalizeQuestionPoints,
  questionDisplayName,
} from './questions.js';

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
