export function activeRunExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expiresAtMilliseconds = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMilliseconds) || expiresAtMilliseconds <= now;
}

export function sandboxDeadline(
  previous: number | null | undefined,
  starting: boolean,
  lifetimeSeconds: number,
  now = Date.now(),
) {
  return starting || previous == null ? now + lifetimeSeconds * 1000 : previous;
}
