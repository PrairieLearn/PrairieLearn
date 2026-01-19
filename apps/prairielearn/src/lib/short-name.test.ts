import { describe, expect, it } from 'vitest';

import {
  SHORT_NAME_PATTERN,
  SHORT_NAME_REGEX,
  isValidShortName,
  validateShortName,
} from './short-name.js';

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

  describe('SHORT_NAME_PATTERN derivation', () => {
    it('is derived from SHORT_NAME_REGEX.source', () => {
      expect(SHORT_NAME_PATTERN).toBe(SHORT_NAME_REGEX.source);
    });

    it('works in HTML pattern context (browser wraps in ^(?:...)$)', () => {
      // Browsers implicitly anchor pattern attributes with ^(?:...)$
      const htmlPatternRegex = new RegExp(`^(?:${SHORT_NAME_PATTERN})$`);

      // Valid cases should match
      expect(htmlPatternRegex.test('question1')).toBe(true);
      expect(htmlPatternRegex.test('folder/question')).toBe(true);

      // Invalid cases should not match
      expect(htmlPatternRegex.test('/question')).toBe(false);
      expect(htmlPatternRegex.test('question/')).toBe(false);
      expect(htmlPatternRegex.test('my question')).toBe(false);
    });
  });

  describe('validateShortName', () => {
    describe('valid short names', () => {
      it('returns valid: true for simple alphanumeric', () => {
        expect(validateShortName('question1')).toEqual({ valid: true });
      });

      it('returns valid: true for directory paths', () => {
        expect(validateShortName('folder/question')).toEqual({ valid: true });
      });

      it('returns valid: true for existing short name match', () => {
        // Even if the name would otherwise be invalid, matching existing is allowed
        expect(validateShortName('/invalid', '/invalid')).toEqual({ valid: true });
      });
    });

    describe('error messages for leading/trailing slashes', () => {
      it('returns specific error for leading slash', () => {
        expect(validateShortName('/question')).toEqual({
          valid: false,
          message: 'Cannot start with a slash',
          serverMessage: 'cannot start with a slash',
        });
      });

      it('returns specific error for trailing slash', () => {
        expect(validateShortName('question/')).toEqual({
          valid: false,
          message: 'Cannot end with a slash',
          serverMessage: 'cannot end with a slash',
        });
      });

      it('returns leading slash error for both leading and trailing', () => {
        // Leading slash check comes first
        expect(validateShortName('/question/')).toEqual({
          valid: false,
          message: 'Cannot start with a slash',
          serverMessage: 'cannot start with a slash',
        });
      });
    });

    describe('error messages for consecutive slashes', () => {
      it('returns specific error for double slashes', () => {
        expect(validateShortName('folder//question')).toEqual({
          valid: false,
          message: 'Cannot contain two consecutive slashes',
          serverMessage: 'cannot contain two consecutive slashes',
        });
      });
    });

    describe('error messages for invalid characters', () => {
      it('returns specific error for spaces', () => {
        expect(validateShortName('my question')).toEqual({
          valid: false,
          message: 'Cannot contain spaces',
          serverMessage: 'cannot contain spaces',
        });
      });

      it('returns specific error for other invalid characters', () => {
        expect(validateShortName('question@1')).toEqual({
          valid: false,
          message: 'Cannot contain the character "@"',
          serverMessage: 'cannot contain the character "@"',
        });
      });

      it('returns specific error for dot', () => {
        expect(validateShortName('question.1')).toEqual({
          valid: false,
          message: 'Cannot contain the character "."',
          serverMessage: 'cannot contain the character "."',
        });
      });
    });

    describe('existingShortName parameter', () => {
      it('allows exact match of existing short name', () => {
        expect(validateShortName('question1', 'question1')).toEqual({ valid: true });
      });

      it('validates when different from existing short name', () => {
        expect(validateShortName('/invalid', 'question1')).toEqual({
          valid: false,
          message: 'Cannot start with a slash',
          serverMessage: 'cannot start with a slash',
        });
      });
    });
  });
});
