import { isFuture, isValid, parseISO } from 'date-fns';

export function isAccessRuleAccessibleInFuture({
  endDate,
}: {
  endDate: string | null | undefined;
}) {
  if (!endDate) return true;

  // We don't have easy access to the course instance's timezone, so we'll
  // just parse it in the machine's local timezone. This is fine, as we're
  // only interesting in a rough signal of whether the end date is in the
  // future. If we're off by up to a day, it's not a big deal.
  //
  // If the date is invalid, we'll treat it as though it's in the past and
  // thus that it does not make the course instance accessible.
  //
  // `parseISO` is used instead of `new Date` for consistency with `course-db.ts`.
  const parsedDate = parseISO(endDate);
  if (!isValid(parsedDate)) return false;
  return isFuture(parsedDate);
}
