import { describe, expect, it } from 'vitest';

import { buildIssueMailtoLink } from './issues.shared.js';

describe('buildIssueMailtoLink', () => {
  const issue = {
    user_name: 'Ada Lovelace',
    user_email: 'ada@example.com',
    user_uid: 'ada@example.com',
    student_message: 'The plot is upside down',
  };

  function recipientOf(link: string) {
    return link.slice('mailto:'.length, link.indexOf('?'));
  }

  it('addresses the email when there is one', () => {
    const link = buildIssueMailtoLink(issue);
    expect(link).not.toBeNull();
    expect(recipientOf(link as string)).toBe('ada@example.com');
  });

  it('prefers the email over the uid', () => {
    const link = buildIssueMailtoLink({ ...issue, user_uid: 'ada@other.example.com' });
    expect(recipientOf(link as string)).toBe('ada@example.com');
  });

  it('falls back to the uid when it looks like an address', () => {
    const link = buildIssueMailtoLink({ ...issue, user_email: null });
    expect(recipientOf(link as string)).toBe('ada@example.com');
  });

  it('falls back to the uid when the stored email is not an address', () => {
    // `users.email` is an unconstrained varchar written from whatever the
    // authentication provider supplied, so it can hold something that is not
    // an address at all. Preferring it blindly would reintroduce the bug.
    const link = buildIssueMailtoLink({ ...issue, user_email: 'alovelace' });
    expect(recipientOf(link as string)).toBe('ada@example.com');
  });

  it('returns null when neither the email nor the uid is an address', () => {
    expect(
      buildIssueMailtoLink({ ...issue, user_email: 'alovelace', user_uid: 'alovelace' }),
    ).toBeNull();
  });

  it.each(['@', 'user@', '@example.com', 'a b@example.com'])(
    'rejects the malformed address %j rather than linking it',
    (bad) => {
      expect(buildIssueMailtoLink({ ...issue, user_email: bad, user_uid: bad })).toBeNull();
    },
  );

  it('returns null when the uid is not an address', () => {
    // A uid is an arbitrary institutional identifier. `mailto:alovelace` is
    // not a usable link, so no link should be offered at all.
    expect(buildIssueMailtoLink({ ...issue, user_email: null, user_uid: 'alovelace' })).toBeNull();
  });

  it('returns null when there is no email and no uid', () => {
    expect(buildIssueMailtoLink({ ...issue, user_email: null, user_uid: null })).toBeNull();
  });

  it('treats blank fields as missing', () => {
    expect(
      buildIssueMailtoLink({ ...issue, user_email: '   ', user_uid: '   ' }),
    ).toBeNull();
  });

  it('does not link an address whose characters would truncate the link', () => {
    // This is the case that originally produced `mailto:odd`: the `?` began
    // the query string and the `#` a fragment, so the address was cut short
    // and the subject and body were dropped. It is now rejected before a link
    // is built at all, which is why the encoding below is a second line of
    // defence rather than the only one.
    expect(
      buildIssueMailtoLink({ ...issue, user_email: null, user_uid: 'odd?name#tag@example.com' }),
    ).toBeNull();
  });

  it('greets the user by name', () => {
    const link = buildIssueMailtoLink(issue) as string;
    expect(decodeURIComponent(link)).toContain('Hello Ada Lovelace,');
  });

  it('does not greet a null name as "null"', () => {
    const link = buildIssueMailtoLink({ ...issue, user_name: null }) as string;
    const decoded = decodeURIComponent(link);
    expect(decoded).not.toContain('null');
    expect(decoded).toContain('Hello there,');
  });

  it('stands in for a missing student message', () => {
    const link = buildIssueMailtoLink({ ...issue, student_message: null }) as string;
    expect(decodeURIComponent(link)).toContain('"-"');
  });
});
