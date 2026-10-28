/** The fields of an issue needed to contact the user who reported it. */
export interface IssueContact {
  user_name: string | null;
  user_email: string | null;
  user_uid: string | null;
  student_message: string | null;
}

/**
 * Chooses the address to write to about an issue.
 *
 * Neither column is constrained to hold an address. `users.email` is a plain
 * `varchar(255)` written from whatever the authentication provider supplied,
 * and a `uid` is an arbitrary institutional identifier that merely happens to
 * be an email address at most institutions. So both are held to the same test,
 * and `email` is preferred only when it is actually usable.
 *
 * @returns The address, or null if the issue has none.
 */
function selectIssueRecipient(user_email: string | null, user_uid: string | null): string | null {
  const email = user_email?.trim();
  if (email?.includes('@')) return email;

  const uid = user_uid?.trim();
  if (uid?.includes('@')) return uid;

  return null;
}

/**
 * Builds the `mailto:` link for contacting the user who reported an issue.
 *
 * Callers must render the user as plain text when this returns null. Linking
 * to a placeholder produces a `mailto:` that opens a draft addressed to
 * nobody, which is worse than offering no link at all.
 *
 * @param issue The issue whose reporter should be contacted.
 * @returns The `mailto:` URL, or null if the issue has no address to send to.
 */
export function buildIssueMailtoLink(issue: IssueContact): string | null {
  const recipient = selectIssueRecipient(issue.user_email, issue.user_uid);
  if (recipient === null) return null;

  const body = `Hello ${issue.user_name?.trim() || 'there'},\n\nRegarding the issue of:\n\n"${issue.student_message || '-'}"\n\nWe've...`;

  // The recipient sits ahead of the query string, so a `?`, `#` or space in it
  // would truncate or corrupt the link. `@` is restored afterwards because it
  // is legal unencoded in a mailto address and clients display it as typed.
  const encodedRecipient = encodeURIComponent(recipient).replaceAll('%40', '@');

  return `mailto:${encodedRecipient}?subject=${encodeURIComponent(
    'Reported PrairieLearn Issue',
  )}&body=${encodeURIComponent(body)}`;
}
