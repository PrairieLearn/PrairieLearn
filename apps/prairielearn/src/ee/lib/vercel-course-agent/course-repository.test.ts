import { expect, test } from 'vitest';

import { courseRepository } from './course-repository.js';

test.each(['git@github.com:PrairieLearn/course.git', 'https://github.com/PrairieLearn/course.git'])(
  'uses the stored course remote and branch: %s',
  (repository) => {
    expect(courseRepository({ repository, branch: 'course-content' })).toEqual({
      url: 'https://github.com/PrairieLearn/course.git',
      branch: 'course-content',
    });
  },
);

test.each([
  null,
  '',
  'https://evil.example/org/course.git',
  'https://github.com/org/course.git?token=secret',
  'https://github.com/org/course.git#fragment',
  'https://token@github.com/org/course.git',
  'https://github.com/org/course/extra',
  'https://github.com/org%2Fother/course.git',
])('rejects missing or unsafe remotes: %s', (repository) => {
  expect(() => courseRepository({ repository, branch: 'main' })).toThrow(
    'Configure a GitHub repository',
  );
});
