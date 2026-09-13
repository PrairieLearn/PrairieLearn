export function activeRunExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expiresAtMilliseconds = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMilliseconds) || expiresAtMilliseconds <= now;
}

export const ACTIVE_RECHECK_MS = 60_000;
export const SANDBOX_SLEEP_AFTER_SECONDS = 6 * 60 * 60;

export function idleDeadline(idleTimeoutSeconds: number, now = Date.now()) {
  return now + idleTimeoutSeconds * 1000;
}
