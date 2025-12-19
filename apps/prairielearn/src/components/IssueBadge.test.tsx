import { describe, expect, it } from 'vitest';

import { renderHtml } from '@prairielearn/preact';

import { IssueBadge } from './IssueBadge.js';

describe('IssueBadge', () => {
  it('should wrap QID with quotes when generating query string', () => {
    const html = renderHtml(
      <IssueBadge
        count={5}
        urlPrefix="/pl/course_instance/123/instructor"
        issueQid="question with spaces"
      />,
    );

    // The URL should contain qid%3A%22question%20with%20spaces%22
    // %3A is ':', %22 is '"', and %20 is space
    expect(html.toString()).toContain('qid%3A%22question%20with%20spaces%22');
  });

  it('should wrap assessment with quotes when generating query string', () => {
    const html = renderHtml(
      <IssueBadge
        count={3}
        urlPrefix="/pl/course_instance/123/instructor"
        issueAid="assessment with spaces"
      />,
    );

    // The URL should contain assessment%3A%22assessment%20with%20spaces%22
    // %3A is ':', %22 is '"', and %20 is space
    expect(html.toString()).toContain('assessment%3A%22assessment%20with%20spaces%22');
  });

  it('should wrap both QID and assessment with quotes when both are provided', () => {
    const html = renderHtml(
      <IssueBadge
        count={2}
        urlPrefix="/pl/course_instance/123/instructor"
        issueQid="question with spaces"
        issueAid="assessment with spaces"
      />,
    );

    expect(html.toString()).toContain('qid%3A%22question%20with%20spaces%22');
    expect(html.toString()).toContain('assessment%3A%22assessment%20with%20spaces%22');
  });

  it('should work with QIDs without spaces', () => {
    const html = renderHtml(
      <IssueBadge
        count={1}
        urlPrefix="/pl/course_instance/123/instructor"
        issueQid="simple-question"
      />,
    );

    // Even without spaces, the quotes should be present
    expect(html.toString()).toContain('qid%3A%22simple-question%22');
  });

  it('should return empty string when count is 0', () => {
    const html = renderHtml(
      <IssueBadge count={0} urlPrefix="/pl/course_instance/123/instructor" issueQid="question" />,
    );

    expect(html).toBe('');
  });

  it('should generate link with only is:open when no QID or assessment provided', () => {
    const html = renderHtml(
      <IssueBadge count={10} urlPrefix="/pl/course_instance/123/instructor" />,
    );

    expect(html.toString()).toContain('q=is%3Aopen');
    expect(html.toString()).not.toContain('qid');
    expect(html.toString()).not.toContain('assessment');
  });

  it('should suppress link when suppressLink is true', () => {
    const html = renderHtml(<IssueBadge count={5} suppressLink />);

    expect(html.toString()).not.toContain('href');
    expect(html.toString()).toContain('badge');
  });
});
