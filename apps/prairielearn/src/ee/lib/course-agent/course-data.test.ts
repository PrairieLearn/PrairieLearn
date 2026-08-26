import { assert, describe, it } from 'vitest';

import { CourseDataQuerySchema } from '@prairielearn/course-agent-protocol';

import {
  CourseDataQueryValidationError,
  describeCourseDataResource,
  listCourseDataResources,
  validateCourseDataQuery,
} from './course-data.js';

describe('course-data semantic resources', () => {
  it('exposes only the initial allowlisted resources and fields', () => {
    assert.deepEqual(
      listCourseDataResources().map(({ resource }) => resource),
      ['course_instances', 'students', 'assessments', 'assessment_attempts'],
    );

    const students = describeCourseDataResource('students');
    assert.includeMembers(
      students.fields.map(({ name }) => name),
      ['course_instance.id', 'student.id', 'student.uid', 'student.name'],
    );
    assert.notInclude(
      students.fields.map(({ name }) => name),
      'student.email',
    );
    assert.notInclude(
      students.fields.map(({ name }) => name),
      'student.uin',
    );
  });

  it('accepts a bounded aggregate over allowlisted fields', () => {
    const query = CourseDataQuerySchema.parse({
      resource: 'assessment_attempts',
      select: ['assessment.tid'],
      groupBy: ['assessment.tid'],
      metrics: [{ op: 'avg', field: 'attempt.score_perc', as: 'average_score' }],
      orderBy: [{ field: 'average_score', direction: 'desc' }],
      limit: 20,
    });

    assert.doesNotThrow(() => validateCourseDataQuery(query));

    const countNames = CourseDataQuerySchema.parse({
      resource: 'students',
      metrics: [{ op: 'count', field: 'student.uid', as: 'identified_students' }],
    });
    assert.doesNotThrow(() => validateCourseDataQuery(countNames));
  });

  it('rejects fields and operators outside the semantic allowlist', () => {
    const forbiddenField = CourseDataQuerySchema.parse({
      resource: 'students',
      select: ['student.email'],
    });
    assert.throws(() => validateCourseDataQuery(forbiddenField), CourseDataQueryValidationError);

    const invalidOperator = CourseDataQuerySchema.parse({
      resource: 'assessment_attempts',
      select: ['attempt.open'],
      where: [{ field: 'attempt.open', op: 'contains', value: 'true' }],
    });
    assert.throws(() => validateCourseDataQuery(invalidOperator), CourseDataQueryValidationError);
  });

  it('rejects unsafe aggregate projections and value types', () => {
    const projection = CourseDataQuerySchema.parse({
      resource: 'assessment_attempts',
      select: ['student.uid'],
      groupBy: ['assessment.tid'],
      metrics: [{ op: 'count', as: 'attempt_count' }],
    });
    assert.throws(() => validateCourseDataQuery(projection), CourseDataQueryValidationError);

    const invalidValue = CourseDataQuerySchema.parse({
      resource: 'assessment_attempts',
      select: ['attempt.score_perc'],
      where: [{ field: 'attempt.score_perc', op: 'gte', value: 'ninety' }],
    });
    assert.throws(() => validateCourseDataQuery(invalidValue), CourseDataQueryValidationError);
  });
});
