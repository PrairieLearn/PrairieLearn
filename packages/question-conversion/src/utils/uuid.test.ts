import { assert, describe, it } from 'vitest';
import z from 'zod';

import { stableUuid } from './uuid.js';

describe('stableUuid', () => {
  it('produces a valid UUID string', () => {
    const result = stableUuid('source', 'bank', 'item');
    assert.doesNotThrow(() => z.uuid().parse(result));
  });

  it('is deterministic for the same inputs', () => {
    const a = stableUuid('file.xml', 'bank1', 'item1');
    const b = stableUuid('file.xml', 'bank1', 'item1');
    assert.equal(a, b);
  });

  it('produces different UUIDs for different inputs', () => {
    const a = stableUuid('file.xml', 'bank1', 'item1');
    const b = stableUuid('file.xml', 'bank1', 'item2');
    assert.notEqual(a, b);
  });

  it('works with a single part', () => {
    const result = stableUuid('only-source');
    assert.doesNotThrow(() => z.uuid().parse(result));
  });
});
