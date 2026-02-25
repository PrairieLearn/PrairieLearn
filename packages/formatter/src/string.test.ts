import { assert, describe, it } from 'vitest';

import { truncateMiddle } from './string.js';

describe('truncateMiddle', () => {
  it('does not truncate when string fits', () => {
    assert.equal(truncateMiddle('hello', 10), 'hello');
  });

  it('does not truncate when string exactly matches maxLength', () => {
    assert.equal(truncateMiddle('hello', 5), 'hello');
  });

  it('truncates with 60/40 split', () => {
    assert.equal(truncateMiddle('Introduction to Computing', 20), 'Introductio...puting');
  });

  it('favors the start of the string', () => {
    assert.equal(truncateMiddle('CS 101 Proficiency Exam', 16), 'CS 101 P... Exam');
  });

  it('handles very short maxLength', () => {
    assert.equal(truncateMiddle('hello world', 4), 'h...');
  });

  it('handles maxLength equal to ellipsis length', () => {
    assert.equal(truncateMiddle('hello world', 3), '...');
  });

  it('handles empty string', () => {
    assert.equal(truncateMiddle('', 10), '');
  });
});
