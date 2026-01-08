import { describe, expect, it } from 'vitest';

import { formatOtpValue } from './OtpInput.js';

describe('formatOtpValue', () => {
  it('should filter out non-alphanumeric characters + uppercase characters', () => {
    expect(formatOtpValue('ABC-DEF-GHIJ', 10)).toBe('ABCDEFGHIJ');
    expect(formatOtpValue('A!B@C#1$2%3^', 10)).toBe('ABC123');
    expect(formatOtpValue('hello world', 10)).toBe('HELLOWORLD');
  });

  it('should truncate to max length', () => {
    expect(formatOtpValue('ABCDEFGHIJKLMNOP', 10)).toBe('ABCDEFGHIJ');
    expect(formatOtpValue('ABCD', 4)).toBe('ABCD');
    expect(formatOtpValue('ABCDEF', 4)).toBe('ABCD');
  });

  it('should handle edge cases', () => {
    expect(formatOtpValue('', 10)).toBe('');
    expect(formatOtpValue('!@#$%^&*()', 10)).toBe('');
    expect(formatOtpValue('---', 10)).toBe('');
  });
});
