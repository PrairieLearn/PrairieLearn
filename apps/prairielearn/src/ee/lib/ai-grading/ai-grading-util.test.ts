import { describe, expect, it } from 'vitest';

import { correctGeminiMalformedRubricGradingJson } from './ai-grading-util.js';

describe('correctGeminiMalformedRubricGradingJson', function () {
  it('should escape single backslash preceding unescapable character', () => {
    // Example with unescaped backslash before 'm' in \mathbb{x}. m is not a valid escape character.
    // Note that in JavaScript strings, \\ represents a single backslash.
    const input = '{"explanation": "test", "rubric_items": {"\\mathbb{x}": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    expect(result).toBeTruthy();
    expect(result).toBe('{"explanation": "test", "rubric_items": {"\\\\mathbb{x}": true}}');

    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);

    // JSON parses \\ into \
    expect(parsed.rubric_items).toHaveProperty('\\mathbb{x}');
  });

  it('should escape single backslash preceding valid escape character', () => {
    // Example with unescaped backslash before 't' in \test. t is a valid escape character.
    const input = '{"explanation": "test", "rubric_items": {"\\test": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    expect(result).toBeTruthy();
    expect(result).toBe('{"explanation": "test", "rubric_items": {"\\\\test": true}}');

    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);
    expect(parsed.rubric_items).toHaveProperty('\\test');
  });

  it('should escape double backslash', () => {
    // Valid JSON with properly escaped backslashes
    const input = '{"explanation": "test", "rubric_items": {"\\\\mathbb{x}": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    // Should remain valid JSON
    expect(result).toBeTruthy();
    expect(result).toBe('{"explanation": "test", "rubric_items": {"\\\\\\\\mathbb{x}": true}}');

    expect(() => JSON.parse(result!)).not.toThrow();

    // The key should remain escaped
    const parsed = JSON.parse(result!);
    expect(Object.keys(parsed.rubric_items)[0]).toBe('\\\\mathbb{x}');
  });

  it('should keep keys without backslashes the same', () => {
    // Valid JSON without backslashes in the keys
    const input =
      '{"explanation": "test", "rubric_items": {"Simple description": true, "Another item": false}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    // Should remain valid JSON
    expect(result).toBeTruthy();
    expect(result).toBe(
      '{"explanation": "test", "rubric_items": {"Simple description": true, "Another item": false}}',
    );

    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);
    expect(parsed.rubric_items).toEqual({
      'Simple description': true,
      'Another item': false,
    });
  });
});
