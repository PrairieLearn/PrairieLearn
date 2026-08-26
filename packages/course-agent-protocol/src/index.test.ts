import { assert, describe, it } from 'vitest';

import {
  CourseDataQuerySchema,
  makeCourseWorkspacePath,
  normalizeCourseWorkspaceDirectory,
} from './index.js';

describe('course agent workspace paths', () => {
  it('normalizes a course short name into one safe path segment', () => {
    assert.equal(normalizeCourseWorkspaceDirectory('ECE 101 / Fall'), 'ECE-101-Fall');
  });

  it('constructs a path below the fixed workspace root', () => {
    assert.equal(makeCourseWorkspacePath('ECE-101'), '/workspace/ECE-101');
  });
});

describe('course data query protocol', () => {
  it('applies bounded defaults to a structured query', () => {
    const query = CourseDataQuerySchema.parse({
      resource: 'students',
      select: ['student.uid', 'student.name'],
    });

    assert.deepEqual(query.where, []);
    assert.deepEqual(query.groupBy, []);
    assert.deepEqual(query.metrics, []);
    assert.deepEqual(query.orderBy, []);
    assert.equal(query.limit, 1000);
  });

  it('rejects empty queries and metrics without required fields', () => {
    assert.equal(CourseDataQuerySchema.safeParse({ resource: 'students' }).success, false);
    assert.equal(
      CourseDataQuerySchema.safeParse({
        resource: 'students',
        metrics: [{ op: 'avg', as: 'average' }],
      }).success,
      false,
    );
  });
});
