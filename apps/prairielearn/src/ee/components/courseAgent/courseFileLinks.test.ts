import { describe, expect, it } from 'vitest';

import { courseFileLinkTransform } from './courseFileLinks.js';

describe('courseFileLinkTransform', () => {
  const transform = courseFileLinkTransform('7');

  it('sends sandbox file links to the course file route', () => {
    expect(transform('/workspace/session/course/questions/addNumbers/server.py:12')).toBe(
      '/pl/course/7/course_agent/file/questions/addNumbers/server.py',
    );
    expect(transform('/workspace/session/course/My%20Notes/a%23b.md')).toBe(
      '/pl/course/7/course_agent/file/My%20Notes/a%23b.md',
    );
  });

  it('leaves other links alone', () => {
    expect(transform('https://docs.prairielearn.com/')).toBe('https://docs.prairielearn.com/');
    expect(transform('/workspace/session/courses/other')).toBe('/workspace/session/courses/other');
  });
});
