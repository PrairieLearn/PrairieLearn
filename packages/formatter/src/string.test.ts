import { assert, describe, it } from 'vitest';

import { truncateMiddle } from './string.js';

describe('truncateMiddle', () => {
  it('should not truncate a string that fits within maxLength', () => {
    assert.equal(truncateMiddle('ECE-GY 6913', 20), 'ECE-GY 6913');
  });

  it('should not truncate a string that exactly matches maxLength', () => {
    assert.equal(truncateMiddle('ECE-GY 6913', 11), 'ECE-GY 6913');
  });

  it('should truncate in the middle preserving start and end', () => {
    assert.equal(truncateMiddle('Introduction to Computing', 20), 'Introductio...puting');
  });

  it('should favor the start of the string', () => {
    assert.equal(truncateMiddle('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 15), 'ABCDEFGH...WXYZ');
  });

  it('should handle realistic course names at limit 16', () => {
    assert.equal(truncateMiddle('CS 101 Proficiency Exam', 16), 'CS 101 P... Exam');
  });

  it('should handle realistic term that is one char too long', () => {
    assert.equal(truncateMiddle('Spring 2023', 10), 'Sprin...23');
  });

  it('should handle a very short maxLength', () => {
    assert.equal(truncateMiddle('hello world', 4), 'h...');
  });

  it('should handle maxLength of 3', () => {
    assert.equal(truncateMiddle('hello world', 3), '...');
  });

  it('should handle an empty string', () => {
    assert.equal(truncateMiddle('', 10), '');
  });
});
