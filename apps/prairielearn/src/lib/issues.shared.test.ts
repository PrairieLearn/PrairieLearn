import { describe, expect, it } from 'vitest';

import { issueMailtoLink } from './issues.shared.js';

describe('issueMailtoLink', () => {
  const issue = {
    user_email: null,
    user_name: 'Anjali',
    user_uid: null,
    student_message: 'The answer was marked wrong',
  };

  it('links to the email address when one is set', () => {
    const link = issueMailtoLink({ ...issue, user_email: 'anjali@example.com' });

    expect(link).toMatch(/^mailto:anjali@example\.com\?subject=/);
  });

  it('prefers the email address over the UID', () => {
    const link = issueMailtoLink({
      ...issue,
      user_email: 'anjali@example.com',
      user_uid: 'anjali@example.edu',
    });

    expect(link).toMatch(/^mailto:anjali@example\.com\?/);
  });

  it('falls back to the UID when it is an email address', () => {
    const link = issueMailtoLink({ ...issue, user_uid: 'anjali@example.edu' });

    expect(link).toMatch(/^mailto:anjali@example\.edu\?/);
  });

  it('returns null for a UID that is not an email address', () => {
    expect(issueMailtoLink({ ...issue, user_uid: 'anjali' })).toBeNull();
  });

  it('returns null when neither an email address nor a UID is set', () => {
    expect(issueMailtoLink(issue)).toBeNull();
  });

  it('includes the student message in the body', () => {
    const link = issueMailtoLink({ ...issue, user_email: 'anjali@example.com' });

    expect(link).toContain(encodeURIComponent('The answer was marked wrong'));
  });
});
