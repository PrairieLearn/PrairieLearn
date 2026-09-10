import { describe, expect, it } from 'vitest';

import { courseAgentErrorMessage, validateCourseAgentPublication } from './publication.js';

describe('course-agent publication validation', () => {
  it('preserves actionable logs while redacting credentials', () => {
    expect(
      courseAgentErrorMessage(
        new Error(
          '\u001b[31mSync failed: unknown QID\u001b[0m\nhttps://user:secret@github.com/course.git\nAuthorization: Bearer private\nghp_abcdef',
        ),
      ),
    ).toBe(
      'Sync failed: unknown QID\nhttps://[redacted]@github.com/course.git\nAuthorization: Bearer [redacted]\n[redacted]',
    );
  });
  const course = {
    repository: 'https://github.com/PrairieLearn/course.git',
    branch: 'master',
  };

  it('rejects stale metadata and empty diffs', () => {
    expect(() =>
      validateCourseAgentPublication(
        { repository: course.repository, branch: 'other', base_sha: 'a'.repeat(40), diff: 'x' },
        course,
      ),
    ).toThrow('changed while');
    expect(() =>
      validateCourseAgentPublication(
        {
          repository: course.repository,
          branch: course.branch,
          base_sha: 'a'.repeat(40),
          diff: '',
        },
        course,
      ),
    ).toThrow('empty');
  });
});
