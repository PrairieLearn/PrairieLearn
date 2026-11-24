import { timingSafeEqual } from 'node:crypto';

/**
 * Checks a request's `Authorization` header against the PrairieLearn service
 * token. Only PrairieLearn may call this service; browsers never connect to it.
 */
export function isAuthorized(header: string | null, token: string | undefined): boolean {
  if (!token) return false;
  const supplied = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
