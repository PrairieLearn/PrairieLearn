import { expect, test } from 'vitest';

import { readOnlyPolicy, repositoryPath } from './policy.ts';

test.each([
  'https://github.com/PrairieLearn/test-course.git',
  'git@github.com:PrairieLearn/test-course.git',
  'ssh://git@github.com/PrairieLearn/test-course.git',
])('normalizes supported course URL %s', (url) => {
  expect(repositoryPath(url)).toBe('PrairieLearn/test-course');
});

test.each([
  'https://github.com.evil.test/a/b',
  'https://token@github.com/a/b',
  'https://github.com/a/../b',
  'file:///tmp/course',
])('rejects repository URL %s', (url) => {
  expect(() => repositoryPath(url)).toThrow();
});

test('credential injection is limited to authenticated read operations on the configured repository', () => {
  const policy = readOnlyPolicy('https://github.com/PrairieLearn/test-course.git', 'secret-token');
  expect(policy).toMatchObject({
    allow: {
      'github.com': [
        {
          match: {
            method: ['GET'],
            path: { exact: '/PrairieLearn/test-course.git/info/refs' },
            queryString: [{ key: { exact: 'service' }, value: { exact: 'git-upload-pack' } }],
          },
        },
        {
          match: {
            method: ['POST'],
            path: { exact: '/PrairieLearn/test-course.git/git-upload-pack' },
          },
        },
      ],
    },
  });
  expect(JSON.stringify(policy)).not.toContain('git-receive-pack');
  expect(JSON.stringify(policy)).not.toContain('allow-all');
});
