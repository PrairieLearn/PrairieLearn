import { describe, expect, it } from 'vitest';

import { validateCourseAgentPublication } from './publication.js';

describe('course-agent publication validation', () => {
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
    ).toThrow('no longer matches');
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
