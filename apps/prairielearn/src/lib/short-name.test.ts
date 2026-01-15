import { describe, expect, it } from 'vitest';

import { SHORT_NAME_REGEX, isValidShortName } from './short-name.js';

describe('short-name validation', () => {
  describe('valid short names', () => {
    const validCases = [
      { name: 'simple alphanumeric', value: 'question1' },
      { name: 'uppercase letters', value: 'Question1' },
      { name: 'single character', value: 'Q' },
      { name: 'with hyphens', value: 'my-question' },
      { name: 'with underscores', value: 'my_question' },
      { name: 'starting with hyphen', value: '-question' },
      { name: 'starting with underscore', value: '_question' },
      { name: 'single directory', value: 'folder/question' },
      { name: 'multiple directories', value: 'Exam1/Topic/Q1' },
      { name: 'mixed characters', value: 'Exam1-Q2_test' },
      { name: 'directory with hyphen', value: 'my-folder/my-question' },
      { name: 'directory starting with hyphen', value: '-folder/-question' },
    ];

    it.each(validCases)('accepts $name: "$value"', ({ value }) => {
      expect(isValidShortName(value)).toBe(true);
      expect(SHORT_NAME_REGEX.test(value)).toBe(true);
    });
  });

  describe('invalid short names - leading/trailing slashes', () => {
    const invalidSlashCases = [
      { name: 'leading slash', value: '/question' },
      { name: 'trailing slash', value: 'question/' },
      { name: 'both leading and trailing slashes', value: '/question/' },
      { name: 'leading slash with directory', value: '/folder/question' },
      { name: 'trailing slash with directory', value: 'folder/question/' },
      { name: 'only a slash', value: '/' },
      { name: 'multiple leading slashes', value: '//question' },
      { name: 'multiple trailing slashes', value: 'question//' },
    ];

    it.each(invalidSlashCases)('rejects $name: "$value"', ({ value }) => {
      expect(isValidShortName(value)).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('invalid short names - empty components', () => {
    const emptyComponentCases = [
      { name: 'double slash in middle', value: 'folder//question' },
      { name: 'empty string', value: '' },
    ];

    it.each(emptyComponentCases)('rejects $name: "$value"', ({ value }) => {
      expect(isValidShortName(value)).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('invalid short names - disallowed characters', () => {
    const disallowedCharCases = [
      { name: 'space', value: 'my question' },
      { name: 'dot', value: 'question.1' },
      { name: 'leading dot', value: '.hidden' },
      { name: 'at sign', value: 'question@1' },
      { name: 'hash', value: 'question#1' },
      { name: 'asterisk', value: 'question*' },
      { name: 'parentheses', value: 'question(1)' },
      { name: 'equals', value: 'question=1' },
      { name: 'plus', value: 'question+1' },
      { name: 'backslash', value: 'folder\\question' },
    ];

    it.each(disallowedCharCases)('rejects $name: "$value"', ({ value }) => {
      expect(isValidShortName(value)).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });
});
