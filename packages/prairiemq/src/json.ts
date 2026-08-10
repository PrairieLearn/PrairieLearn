import type { JsonValue } from './types.js';

function invalidJsonValue(label: string, path: string, reason: string): never {
  throw new Error(`${label} contains an invalid JSON value at ${path}: ${reason}`);
}

function normalizeJsonValue(
  value: unknown,
  label: string,
  path: string,
  ancestors: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidJsonValue(label, path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) invalidJsonValue(label, path, 'circular references are not allowed');
    ancestors.add(value);
    try {
      return value.map((item, index) =>
        normalizeJsonValue(item, label, `${path}[${index}]`, ancestors),
      );
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      invalidJsonValue(label, path, 'objects must be plain objects');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      invalidJsonValue(label, path, 'symbol properties are not allowed');
    }
    if (ancestors.has(value)) invalidJsonValue(label, path, 'circular references are not allowed');
    ancestors.add(value);
    try {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          normalizeJsonValue(item, label, `${path}.${key}`, ancestors),
        ]),
      );
    } finally {
      ancestors.delete(value);
    }
  }
  return invalidJsonValue(label, path, `${typeof value} values are not allowed`);
}

export function serializeJson(value: unknown, label: string): string {
  const normalized = normalizeJsonValue(value ?? null, label, '$', new WeakSet());
  return JSON.stringify(normalized);
}
