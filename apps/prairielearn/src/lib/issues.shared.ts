import { z } from 'zod';

const EmailSchema = z.email();

/**
 * Builds a `mailto:` link for replying to the user who reported an issue.
 *
 * Returns null when neither the user's email nor their UID is an email address,
 * since UIDs are not guaranteed to be email addresses. Callers should render the
 * user without a link in that case.
 */
export function issueMailtoLink(issue: {
  user_email: string | null;
  user_name: string | null;
  user_uid: string | null;
  student_message: string | null;
}): string | null {
  const address = [issue.user_email, issue.user_uid].find(
    (value) => value != null && EmailSchema.safeParse(value).success,
  );
  if (address == null) return null;

  const body = `Hello ${issue.user_name}\n\nRegarding the issue of:\n\n"${issue.student_message || '-'}"\n\nWe've...`;
  return `mailto:${address}?subject=Reported%20PrairieLearn%20Issue&body=${encodeURIComponent(body)}`;
}
