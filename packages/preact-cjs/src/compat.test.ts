import * as ReactOriginal from 'original-preact/compat';
import { assert, describe, test } from 'vitest';

import * as React from './compat.js';

const IGNORE_KEYS = new Set([
  '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
  '__esModule',
  'default',
  'module.exports',
]);

function exportKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj)
    .filter((k) => !IGNORE_KEYS.has(k))
    .sort();
}

describe('preact/compat', () => {
  test('should have same exports', () => {
    const keys = exportKeys(React);
    const originalKeys = exportKeys(ReactOriginal);

    assert.sameMembers(keys, originalKeys);
  });
});
