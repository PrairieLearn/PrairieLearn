import { assert, describe, it } from 'vitest';

import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  it('replaces multiple non-alphanumeric chars with single hyphen', () => {
    assert.equal(slugify('foo---bar!!!baz'), 'foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    assert.equal(slugify('--foo--'), 'foo');
  });

  it('returns "question" for empty string', () => {
    assert.equal(slugify(''), 'question');
  });

  it('returns "question" for all-special-chars string', () => {
    assert.equal(slugify('!!!'), 'question');
  });

  it('handles QTI-style identifiers', () => {
    assert.equal(slugify('g62b0967093d8b8f64a42a5ea9cef3e36'), 'g62b0967093d8b8f64a42a5ea9cef3e36');
  });

  it('handles titles with mixed content', () => {
    assert.equal(slugify('Homework 3.4 - Splay Trees'), 'homework-3-4-splay-trees');
  });
});
