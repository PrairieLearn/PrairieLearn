import { describe, expect, it } from 'vitest';

import { correctGeminiMalformedRubricGradingJson } from '../ee/lib/ai-grading/ai-grading-util.js';

describe('Gemini malformed output JSON correction', function () {
  it('should escape unescaped backslashes before unescapable characters', () => {
    // Example with unescaped backslash before 'm' in \mathbb{x}. m is not escapable.
    const input = '{"explanation": "test", "rubric_items": {"\\mathbb{x}": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    expect(result).toBeTruthy();
    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);
    expect(parsed.rubric_items).toHaveProperty('\\mathbb{x}');
  });

  it('should escape unescaped backslashes before escapable characters', () => {
    // Example with unescaped backslash before 't' in \test. t is escapable.
    const input = '{"explanation": "test", "rubric_items": {"\\test": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    expect(result).toBeTruthy();
    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);
    expect(parsed.rubric_items).toHaveProperty('\\test');
  });

  it('should double-escape already-escaped backslashes', () => {
    // Valid JSON with properly escaped backslashes
    const input = '{"explanation": "test", "rubric_items": {"\\\\mathbb{x}": true}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    // Should remain valid JSON
    expect(result).toBeTruthy();
    expect(() => JSON.parse(result!)).not.toThrow();

    // The key should remain double-escaped
    const parsed = JSON.parse(result!);
    expect(Object.keys(parsed.rubric_items)[0]).toBe('\\\\mathbb{x}');
  });

  it('should preserve keys without backslashes', () => {
    // Normal, valid JSON without special characters
    const input =
      '{"explanation": "test", "rubric_items": {"Simple description": true, "Another item": false}}';
    const result = correctGeminiMalformedRubricGradingJson(input);

    // Should remain valid JSON
    expect(result).toBeTruthy();
    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);
    expect(parsed.rubric_items).toEqual({
      'Simple description': true,
      'Another item': false,
    });
  });
  it('should not affect explanation backslashes', () => {
    const input =
      '{"explanation": "This is a test with a backslash: \\\\ and \\n new line.", "rubric_items": {"\\mathbb": true}}';
    console.log('input', input);
    const result = correctGeminiMalformedRubricGradingJson(input);
    console.log('result', result);

    // Should remain valid JSON
    expect(result).toBeTruthy();
    expect(() => JSON.parse(result!)).not.toThrow();

    const parsed = JSON.parse(result!);

    // Should not modify explanation content
    expect(parsed.explanation).toBe('This is a test with a backslash: \\ and \n new line.');

    // Should still fix the \\mathbb key.
    expect(parsed.rubric_items).toHaveProperty('\\mathbb');
  });
});
