import { assert } from 'chai';

import { applyKeyOrder } from './json.js';

describe('applyKeyOrder', () => {
  it('works with a string', () => {
    assert(applyKeyOrder('a', 'b') === 'b');
  });

  it('works with a number', () => {
    assert(applyKeyOrder(1, 2) === 2);
  });

  it('works with a boolean', () => {
    assert(applyKeyOrder(true, false) === false);
  });

  it('works with a simple object', () => {
    assert.deepEqual(applyKeyOrder({ a: 1 }, { a: 2 }), { a: 2 });
  });

  it('works with an object with multiple keys', () => {
    const original = { a: 1, b: 2 };
    const modified = { b: 3, a: 4 };
    const result = applyKeyOrder(original, modified);
    assert.deepEqual(result, { a: 4, b: 3 });
    assert.deepEqual(Object.keys(result), ['a', 'b']);
  });

  it('works with an object with added keys', () => {
    const original = { a: 1 };
    const modified = { b: 3, a: 1 };
    const result = applyKeyOrder(original, modified);
    assert.deepEqual(result, { a: 1, b: 3 });
    assert.deepEqual(Object.keys(result), ['a', 'b']);
  });

  it('works with an object with removed keys', () => {
    const original = { a: 1, b: 2 };
    const modified = { a: 1 };
    const result = applyKeyOrder(original, modified);
    assert.deepEqual(result, { a: 1 });
    assert.deepEqual(Object.keys(result), ['a']);
  });

  it('works with nested objects', () => {
    const original = { a: { b: 1, c: 2 } };
    const modified = { a: { c: 3, b: 4 } };
    const result = applyKeyOrder(original, modified);
    assert.deepEqual(result, { a: { b: 4, c: 3 } });
    assert.deepEqual(Object.keys(result.a), ['b', 'c']);
  });

  it('works with arrays', () => {
    const original = { a: [{ b: 1, c: 2 }] };
    const modified = { a: [{ c: 3, b: 4 }] };
    const result = applyKeyOrder(original, modified);
    assert.deepEqual(result, { a: [{ b: 4, c: 3 }] });
    assert.deepEqual(Object.keys(result.a[0]), ['b', 'c']);
  });

  it('handles null', () => {
    assert(applyKeyOrder(null, 'a') === 'a');
    assert(applyKeyOrder('a', null) === null);
  });

  it('handles undefined', () => {
    assert(applyKeyOrder(undefined, 'a') === 'a');
    assert(applyKeyOrder('a', undefined) === undefined);
  });
});
