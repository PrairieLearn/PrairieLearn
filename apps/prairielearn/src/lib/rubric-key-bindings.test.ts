import { assert, describe, it } from 'vitest';

import {
  assignKeyBindings,
  customKeyBindingErrors,
  normalizeKeyBinding,
} from './rubric-key-bindings.js';

const item = (customKey: string | null = null) => ({ isGroup: false, customKey });
const group = { isGroup: true, customKey: null };

describe('assignKeyBindings', () => {
  it('numbers items in order and skips groups, like before custom keys', () => {
    assert.deepEqual(assignKeyBindings([item(), group, item(), item()]), ['1', null, '2', '3']);
  });

  it('keeps custom keys and skips the digits they take', () => {
    assert.deepEqual(assignKeyBindings([item(), item('2'), item('x'), item()]), [
      '1',
      '2',
      'x',
      '3',
    ]);
  });

  it('leaves items without a key once the digits run out', () => {
    const keys = assignKeyBindings([item('5'), ...Array.from({ length: 10 }, () => item())]);
    assert.deepEqual(keys, ['5', '1', '2', '3', '4', '6', '7', '8', '9', '0', null]);
  });
});

describe('customKeyBindingErrors', () => {
  it('accepts single letters and digits', () => {
    assert.deepEqual(customKeyBindingErrors([null, 'x', '7']), [null, null, null]);
  });

  it('rejects reserved, duplicate and invalid keys', () => {
    const [reserved, duplicateA, duplicateB, invalid] = customKeyBindingErrors([
      'g',
      'x',
      'x',
      '!',
    ]);
    assert.match(reserved ?? '', /submitting the grade/);
    assert.match(duplicateA ?? '', /another item/);
    assert.match(duplicateB ?? '', /another item/);
    assert.match(invalid ?? '', /single letter or digit/);
  });
});

describe('normalizeKeyBinding', () => {
  it('lowercases keys and treats blank as automatic', () => {
    assert.equal(normalizeKeyBinding(' X '), 'x');
    assert.isNull(normalizeKeyBinding(''));
    assert.isNull(normalizeKeyBinding(null));
  });
});
