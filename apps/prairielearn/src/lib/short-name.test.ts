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

    it.each(validCases)('accepts $name', ({ value }) => {
      expect(validateShortName(value).valid).toBe(true);
      expect(SHORT_NAME_REGEX.test(value)).toBe(true);
    });
  });

  describe('invalid short names', () => {
    const invalidSlashCases = [
      { name: 'empty string', value: '' },
      { name: 'leading slash', value: '/question' },
      { name: 'trailing slash', value: 'question/' },
      { name: 'both leading and trailing slashes', value: '/question/' },
      { name: 'leading slash with directory', value: '/folder/question' },
      { name: 'trailing slash with directory', value: 'folder/question/' },
      { name: 'only a slash', value: '/' },
      { name: 'multiple leading slashes', value: '//question' },
      { name: 'multiple trailing slashes', value: 'question//' },
      { name: 'double slash in middle', value: 'folder//question' },
      { name: 'leading dot', value: '.hidden' },
      { name: 'leading dot in subdirectory', value: 'folder/.hidden' },
      { name: 'leading dot in first directory', value: '.folder/question' },
      { name: 'leading dot in middle directory', value: 'a/.b/c' },
      { name: 'space', value: 'my question' },
      { name: 'at sign', value: 'question@1' },
      { name: 'hash', value: 'question#1' },
      { name: 'asterisk', value: 'question*' },
      { name: 'parentheses', value: 'question(1)' },
      { name: 'equals', value: 'question=1' },
      { name: 'plus', value: 'question+1' },
      { name: 'backslash', value: 'folder\\question' },
    ];

    it.each(invalidSlashCases)('rejects $name', ({ value }) => {
      expect(validateShortName(value).valid).toBe(false);
      expect(SHORT_NAME_REGEX.test(value)).toBe(false);
    });
  });

  describe('error messages', () => {
    const errorCases = [
      {
        name: 'leading slash',
        value: '/question',
        message: 'Cannot start with a slash',
        lowercaseMessage: 'cannot start with a slash',
      },
      {
        name: 'trailing slash',
        value: 'question/',
        message: 'Cannot end with a slash',
        lowercaseMessage: 'cannot end with a slash',
      },
      {
        name: 'double slashes',
        value: 'folder//question',
        message: 'Cannot contain two consecutive slashes',
        lowercaseMessage: 'cannot contain two consecutive slashes',
      },
      {
        name: 'leading dot',
        value: '.hidden',
        message: 'Path segments cannot start with a dot',
        lowercaseMessage: 'path segments cannot start with a dot',
      },
      {
        name: 'leading dot in subdirectory',
        value: 'folder/.hidden',
        message: 'Path segments cannot start with a dot',
        lowercaseMessage: 'path segments cannot start with a dot',
      },
      {
        // Leading slash check comes first when both are present
        name: 'both leading and trailing slashes (leading takes priority)',
        value: '/question/',
        message: 'Cannot start with a slash',
        lowercaseMessage: 'cannot start with a slash',
      },
    ];

    it.each(errorCases)(
      'returns correct error for $name',
      ({ value, message, lowercaseMessage }) => {
        expect(validateShortName(value)).toEqual({
          valid: false,
          message,
          lowercaseMessage,
        });
      },
    );
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
        lowercaseMessage: 'cannot start with a slash',
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
