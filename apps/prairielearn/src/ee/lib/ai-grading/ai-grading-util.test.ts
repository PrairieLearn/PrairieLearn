import { describe, expect, it } from 'vitest';

import { correctGeminiMalformedRubricGradingJson, parseSubmission } from './ai-grading-util.js';

describe('parseSubmission', () => {
  it('should return empty array for empty HTML', () => {
    const result = parseSubmission({ submission_text: '', submitted_answer: null });
    expect(result).toEqual([]);
  });

  it('should return plain text as a single text segment', () => {
    const result = parseSubmission({
      submission_text: 'Hello world',
      submitted_answer: null,
    });
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('should preserve HTML tags in text content', () => {
    const result = parseSubmission({
      submission_text: '<p>This is <b>bold</b> and <u>underlined</u> text</p>',
      submitted_answer: null,
    });
    expect(result).toEqual([
      { type: 'text', text: '<p>This is <b>bold</b> and <u>underlined</u> text</p>' },
    ]);
  });

  it('should preserve inline styles in text content', () => {
    const result = parseSubmission({
      submission_text: '<p><span style="background-color: red">highlighted</span> text</p>',
      submitted_answer: null,
    });
    expect(result).toEqual([
      { type: 'text', text: '<p><span style="background-color: red">highlighted</span> text</p>' },
    ]);
  });

  it('should preserve nested HTML structure', () => {
    const result = parseSubmission({
      submission_text: '<div><p>Paragraph 1</p><p>Paragraph 2</p></div>',
      submitted_answer: null,
    });
    expect(result).toEqual([
      { type: 'text', text: '<div><p>Paragraph 1</p><p>Paragraph 2</p></div>' },
    ]);
  });

  it('should extract a single image segment', () => {
    const result = parseSubmission({
      submission_text:
        '<div data-image-capture-uuid="abc123" data-file-name="photo.jpg">Image</div>',
      submitted_answer: {
        _files: [{ name: 'photo.jpg', contents: 'base64data' }],
      },
    });
    expect(result).toEqual([{ type: 'image', fileName: 'photo.jpg', fileData: 'base64data' }]);
  });

  it('should produce alternating text and image segments', () => {
    const result = parseSubmission({
      submission_text: [
        '<p>Before image</p>',
        '<div data-image-capture-uuid="abc" data-file-name="img.jpg">Image</div>',
        '<p>After image</p>',
      ].join(''),
      submitted_answer: {
        _files: [{ name: 'img.jpg', contents: 'imgdata' }],
      },
    });
    expect(result).toEqual([
      { type: 'text', text: '<p>Before image</p>' },
      { type: 'image', fileName: 'img.jpg', fileData: 'imgdata' },
      { type: 'text', text: '<p>After image</p>' },
    ]);
  });

  it('should handle image nested inside other elements', () => {
    const result = parseSubmission({
      submission_text:
        '<div><p>Text</p><div data-image-capture-uuid="abc" data-file-name="nested.jpg">Image</div></div>',
      submitted_answer: {
        _files: [{ name: 'nested.jpg', contents: 'nesteddata' }],
      },
    });
    // The image element is replaced with a marker inside the <div>, so the
    // surrounding HTML is split at the image boundary.
    expect(result).toEqual([
      { type: 'text', text: '<div><p>Text</p>' },
      { type: 'image', fileName: 'nested.jpg', fileData: 'nesteddata' },
      { type: 'text', text: '</div>' },
    ]);
  });

  it('should handle multiple images', () => {
    const result = parseSubmission({
      submission_text: [
        '<p>Start</p>',
        '<div data-image-capture-uuid="a" data-file-name="first.jpg">Img1</div>',
        '<p>Middle</p>',
        '<div data-image-capture-uuid="b" data-file-name="second.jpg">Img2</div>',
        '<p>End</p>',
      ].join(''),
      submitted_answer: {
        _files: [
          { name: 'first.jpg', contents: 'data1' },
          { name: 'second.jpg', contents: 'data2' },
        ],
      },
    });
    expect(result).toEqual([
      { type: 'text', text: '<p>Start</p>' },
      { type: 'image', fileName: 'first.jpg', fileData: 'data1' },
      { type: 'text', text: '<p>Middle</p>' },
      { type: 'image', fileName: 'second.jpg', fileData: 'data2' },
      { type: 'text', text: '<p>End</p>' },
    ]);
  });

  it('should handle old-style data-options attribute for file name', () => {
    const options = JSON.stringify({ submitted_file_name: 'old.jpg' });
    const result = parseSubmission({
      submission_text: `<div data-image-capture-uuid="abc" data-options='${options}'>Image</div>`,
      submitted_answer: {
        _files: [{ name: 'old.jpg', contents: 'olddata' }],
      },
    });
    expect(result).toEqual([{ type: 'image', fileName: 'old.jpg', fileData: 'olddata' }]);
  });

  it('should include image segment with null fileData when file data is not found', () => {
    const result = parseSubmission({
      submission_text: [
        '<p>Text</p>',
        '<div data-image-capture-uuid="abc" data-file-name="missing.jpg">Image</div>',
      ].join(''),
      submitted_answer: {
        _files: [{ name: 'other.jpg', contents: 'otherdata' }],
      },
    });
    expect(result).toEqual([
      { type: 'text', text: '<p>Text</p>' },
      { type: 'image', fileName: 'missing.jpg', fileData: null },
    ]);
  });

  it('should throw when image found but no submitted_answer', () => {
    expect(() =>
      parseSubmission({
        submission_text: '<div data-image-capture-uuid="abc" data-file-name="img.jpg">Image</div>',
        submitted_answer: null,
      }),
    ).toThrow('No submitted answers found.');
  });

  it('should throw when image element has no file name', () => {
    expect(() =>
      parseSubmission({
        submission_text: '<div data-image-capture-uuid="abc">Image</div>',
        submitted_answer: { _files: [] },
      }),
    ).toThrow('No file name found.');
  });
});

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
