import assert from 'node:assert';

import { wrapLanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { type RubricItem } from '../../../lib/db-types.js';

import {
  correctGeminiMalformedRubricGradingJson,
  createGeminiRepairMiddleware,
  generatePrompt,
  parseAiRubricItems,
  parseSubmission,
} from './ai-grading-util.js';

function makeRubricItem(overrides: Partial<RubricItem> & Pick<RubricItem, 'id'>): RubricItem {
  return {
    rubric_id: '1',
    number: 1,
    points: 1,
    description: 'desc',
    explanation: null,
    grader_note: null,
    always_show_to_students: true,
    deleted_at: null,
    key_binding: null,
    ...overrides,
  };
}

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

describe('parseAiRubricItems', () => {
  const rubric_items: RubricItem[] = [
    makeRubricItem({ id: 'a', description: 'first' }),
    makeRubricItem({ id: 'b', description: 'second' }),
    makeRubricItem({ id: 'c', description: 'third' }),
  ];

  it('maps numbered keys to selected rubric item ids', () => {
    const result = parseAiRubricItems({
      ai_rubric_items: { '1': true, '2': false, '3': true },
      rubric_items,
    });
    expect(result.appliedRubricItems).toEqual([{ rubric_item_id: 'a' }, { rubric_item_id: 'c' }]);
    expect(Array.from(result.appliedRubricDescription)).toEqual(['first', 'third']);
    expect(result.unrecognizedKeys).toEqual([]);
  });

  it('returns empty applied items when nothing is selected', () => {
    const result = parseAiRubricItems({
      ai_rubric_items: { '1': false, '2': false, '3': false },
      rubric_items,
    });
    expect(result.appliedRubricItems).toEqual([]);
    expect(result.appliedRubricDescription.size).toBe(0);
    expect(result.unrecognizedKeys).toEqual([]);
  });

  it('surfaces out-of-range and non-integer keys without throwing', () => {
    const result = parseAiRubricItems({
      ai_rubric_items: { '1': true, '99': true, abc: true, '0': true, '2.5': true },
      rubric_items,
    });
    expect(result.appliedRubricItems).toEqual([{ rubric_item_id: 'a' }]);
    expect(new Set(result.unrecognizedKeys)).toEqual(new Set(['99', 'abc', '0', '2.5']));
  });

  it('handles rubric descriptions with quotes, backslashes, and newlines', () => {
    const trickyItems: RubricItem[] = [
      makeRubricItem({ id: 'x', description: String.raw`Final answer is \mathbb{Z}` }),
      makeRubricItem({ id: 'y', description: 'Wrote "QED"\nat end' }),
    ];
    const result = parseAiRubricItems({
      ai_rubric_items: { '1': true, '2': true },
      rubric_items: trickyItems,
    });
    expect(result.appliedRubricItems).toEqual([{ rubric_item_id: 'x' }, { rubric_item_id: 'y' }]);
    expect(Array.from(result.appliedRubricDescription)).toEqual([
      String.raw`Final answer is \mathbb{Z}`,
      'Wrote "QED"\nat end',
    ]);
    expect(result.unrecognizedKeys).toEqual([]);
  });
});

describe('generatePrompt', () => {
  const baseArgs = {
    questionPrompt: 'What is 2+2?',
    questionAnswer: '4',
    submission_text: '4',
    submitted_answer: null,
    rubric_items: [],
    params: {},
    true_answer: {},
    model_id: 'gpt-5.4-mini-2026-03-17' as const,
  };

  it('renders valid grader_guidelines mustache with substituted variables', async () => {
    const messages = await generatePrompt({
      ...baseArgs,
      grader_guidelines: 'Correct answer is {{correct_answers.x}}.',
      true_answer: { x: 42 },
    });
    const guidelinesMessage = messages.find(
      (m) => typeof m.content === 'string' && m.content.includes('Correct answer is'),
    );
    expect(guidelinesMessage).toBeDefined();
    expect(guidelinesMessage?.content).toBe('Correct answer is 42.');
  });

  it('throws when grader_guidelines has malformed mustache', async () => {
    const brokenTemplate = 'Correct.   "HELLO". \\mathbb{{X+Y}/2}';
    await expect(
      generatePrompt({
        ...baseArgs,
        grader_guidelines: brokenTemplate,
      }),
    ).rejects.toThrow(/Could not parse grader guidelines/);
  });

  it('omits grader_guidelines messages when grader_guidelines is null', async () => {
    const messages = await generatePrompt({
      ...baseArgs,
      grader_guidelines: null,
    });
    const guidelinesPreamble = messages.find(
      (m) => typeof m.content === 'string' && m.content.includes('grader guidelines'),
    );
    expect(guidelinesPreamble).toBeUndefined();
  });
});

describe('correctGeminiMalformedRubricGradingJson', () => {
  it('returns null when there is no rubric_items key', () => {
    expect(correctGeminiMalformedRubricGradingJson('{"explanation": "ok"}')).toBeNull();
  });

  it('escapes unescaped backslashes in rubric item keys to produce valid JSON', () => {
    // The raw text contains `\mathbb{x}` with an unescaped backslash, which is invalid JSON.
    const malformed = '{"explanation": "ok", "rubric_items": {"\\mathbb{x}": true}}';
    expect(() => JSON.parse(malformed)).toThrow();

    const repaired = correctGeminiMalformedRubricGradingJson(malformed);
    assert(repaired !== null);
    expect(JSON.parse(repaired)).toEqual({
      explanation: 'ok',
      rubric_items: { '\\mathbb{x}': true },
    });
  });
});

describe('createGeminiRepairMiddleware', () => {
  async function generateWithRepair(text: string): Promise<string> {
    const model = wrapLanguageModel({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [{ type: 'text', text }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: undefined, text: undefined, reasoning: undefined },
          },
          warnings: [],
        },
      }),
      middleware: createGeminiRepairMiddleware(),
    });

    const result = await model.doGenerate({ prompt: [] });
    const textPart = result.content.find((part) => part.type === 'text');
    assert(textPart?.type === 'text');
    return textPart.text;
  }

  it('leaves valid JSON untouched so backslashes are not double-escaped', async () => {
    const valid = JSON.stringify({ rubric_items: { '\\mathbb{x}': true } });
    expect(await generateWithRepair(valid)).toBe(valid);
  });

  it('repairs malformed Gemini JSON into parseable JSON', async () => {
    const repaired = await generateWithRepair('{"rubric_items": {"\\mathbb{x}": true}}');
    expect(JSON.parse(repaired)).toEqual({ rubric_items: { '\\mathbb{x}': true } });
  });

  it('leaves malformed JSON without a rubric_items key untouched', async () => {
    const malformed = '{"explanation": "\\mathbb{x}"}';
    expect(await generateWithRepair(malformed)).toBe(malformed);
  });
});
