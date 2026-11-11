import { MAX_TIMER_DELAY_MILLISECONDS } from './types.js';

export function validateOptionsObject(
  kind: 'Queue' | 'Worker' | 'limiter',
  options: unknown,
  allowedNames: ReadonlySet<string>,
): Record<string, unknown> {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options) ||
    Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw new Error(`${kind} options must be a plain object`);
  }

  for (const name of Object.keys(options)) {
    if (!allowedNames.has(name)) {
      throw new Error(`Unknown ${kind.toLowerCase()} option "${name}"`);
    }
  }
  return options as Record<string, unknown>;
}

export function normalizeRedisUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('redisUrl must be a redis:// or rediss:// URL with a hostname');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('redisUrl must be a redis:// or rediss:// URL with a hostname');
  }
  if ((url.protocol !== 'redis:' && url.protocol !== 'rediss:') || url.hostname === '') {
    throw new Error('redisUrl must be a redis:// or rediss:// URL with a hostname');
  }
  if (value.includes('?') || value.includes('#')) {
    throw new Error('redisUrl must not include query parameters or a fragment');
  }
  if (url.pathname !== '' && url.pathname !== '/' && !/^\/\d+$/.test(url.pathname)) {
    throw new Error('redisUrl database path must be a non-negative integer');
  }
  return url.href;
}

export function validatePrefix(value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || value === '')) {
    throw new Error('prefix must be a non-empty string');
  }
  if (typeof value === 'string' && /[{}]/.test(value)) {
    throw new Error('prefix must not contain "{" or "}"');
  }
}

export function validateRateLimiter(value: unknown): void {
  const limiter = validateOptionsObject('limiter', value, new Set(['max', 'duration']));
  for (const name of ['max', 'duration']) {
    const option = limiter[name];
    if (typeof option !== 'number' || !Number.isSafeInteger(option) || option < 1) {
      throw new Error(`limiter.${name} must be a positive integer`);
    }
  }
  if (Number(limiter.duration) > MAX_TIMER_DELAY_MILLISECONDS) {
    throw new Error(`limiter.duration must not exceed ${MAX_TIMER_DELAY_MILLISECONDS}ms`);
  }
}
