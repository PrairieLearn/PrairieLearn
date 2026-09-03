export function activeRunExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expiresAtMilliseconds = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMilliseconds) || expiresAtMilliseconds <= now;
}
