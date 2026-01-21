import { describe, expect, it } from 'vitest';

import { SHORT_NAME_PATTERN, SHORT_NAME_REGEX, validateShortName } from './short-name.js';

describe('validateShortName', () => {
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
      { name: 'with dot in middle', value: 'question.1' },
      { name: 'with multiple dots', value: 'question.v1.2' },
      { name: 'dot after directory', value: 'folder/question.1' },
      { name: 'dot in directory name', value: 'folder.v1/question' },
      { name: 'dots in both segments', value: 'folder.v1/question.v2' },
    ];

    it.each(validCases)('accepts $name: "$value"', ({ value }) => {
      expect(validateShortName(value).valid).toBe(true);
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
      expect(validateShortName(value).valid).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('invalid short names - empty components', () => {
    const emptyComponentCases = [
      { name: 'double slash in middle', value: 'folder//question' },
      { name: 'empty string', value: '' },
    ];

    it.each(emptyComponentCases)('rejects $name: "$value"', ({ value }) => {
      expect(validateShortName(value).valid).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('invalid short names - leading dots', () => {
    const leadingDotCases = [
      { name: 'leading dot', value: '.hidden' },
      { name: 'leading dot in subdirectory', value: 'folder/.hidden' },
      { name: 'leading dot in first directory', value: '.folder/question' },
      { name: 'leading dot in middle directory', value: 'a/.b/c' },
    ];

    it.each(leadingDotCases)('rejects $name: "$value"', ({ value }) => {
      expect(validateShortName(value).valid).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('invalid short names - disallowed characters', () => {
    const disallowedCharCases = [
      { name: 'space', value: 'my question' },
      { name: 'at sign', value: 'question@1' },
      { name: 'hash', value: 'question#1' },
      { name: 'asterisk', value: 'question*' },
      { name: 'parentheses', value: 'question(1)' },
      { name: 'equals', value: 'question=1' },
      { name: 'plus', value: 'question+1' },
      { name: 'backslash', value: 'folder\\question' },
    ];

    it.each(disallowedCharCases)('rejects $name: "$value"', ({ value }) => {
      expect(validateShortName(value).valid).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

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

  it('returns specific error for double slashes', () => {
    expect(validateShortName('folder//question')).toEqual({
      valid: false,
      message: 'Cannot contain two consecutive slashes',
      serverMessage: 'cannot contain two consecutive slashes',
    });
  });

  it('returns specific error for leading dot', () => {
    expect(validateShortName('.hidden')).toEqual({
      valid: false,
      message: 'Path segments cannot start with a dot',
      serverMessage: 'path segments cannot start with a dot',
    });
  });

  it('returns specific error for leading dot in subdirectory', () => {
    expect(validateShortName('folder/.hidden')).toEqual({
      valid: false,
      message: 'Path segments cannot start with a dot',
      serverMessage: 'path segments cannot start with a dot',
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

  describe('existingShortName parameter', () => {
    it('allows exact match of existing short name', () => {
      expect(validateShortName('question1', 'question1')).toEqual({ valid: true });
    });

    it('allows exact match even if otherwise invalid', () => {
      expect(validateShortName('/invalid', '/invalid')).toEqual({ valid: true });
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

describe('SHORT_NAME_PATTERN derivation', () => {
  it('is derived from SHORT_NAME_REGEX.source', () => {
    expect(SHORT_NAME_PATTERN).toBe(SHORT_NAME_REGEX.source);
  });

  it('works in HTML pattern context (browser wraps in ^(?:...)$)', () => {
    // Browsers implicitly anchor pattern attributes with ^(?:...)$
    const htmlPatternRegex = new RegExp(`^(?:${SHORT_NAME_PATTERN})$`, 'v');

    // Valid cases should match
    expect(htmlPatternRegex.test('question1')).toBe(true);
    expect(htmlPatternRegex.test('folder/question')).toBe(true);
    expect(htmlPatternRegex.test('question.v1')).toBe(true);
    expect(htmlPatternRegex.test('folder.v1/question.v2')).toBe(true);

    // Invalid cases should not match
    expect(htmlPatternRegex.test('/question')).toBe(false);
    expect(htmlPatternRegex.test('question/')).toBe(false);
    expect(htmlPatternRegex.test('my question')).toBe(false);
    expect(htmlPatternRegex.test('.hidden')).toBe(false);
    expect(htmlPatternRegex.test('folder/.hidden')).toBe(false);
  });
});
