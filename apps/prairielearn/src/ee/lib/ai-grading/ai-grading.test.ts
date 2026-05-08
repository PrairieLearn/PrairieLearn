import { APICallError, JSONParseError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import { describe, expect, it } from 'vitest';

import * as error from '@prairielearn/error';

import { parseAiRubricItems } from './ai-grading-util.js';
import { classifyAiSdkError, formatErrorLogEntry, shouldReportToSentry } from './ai-grading.js';
import type { AIGradingLog } from './types.js';

const baseRubricItem = {
  id: 'item-1',
  rubric_id: 'rubric-1',
  description: 'Correct final answer',
  explanation: null,
  grader_note: null,
  points: 1,
  number: 1,
  always_show_to_students: true,
  deleted_at: null,
  key_binding: null,
} as const;

describe('parseAiRubricItems', () => {
  it('returns applied items when all AI descriptions match', () => {
    const result = parseAiRubricItems({
      ai_rubric_items: { 'Correct final answer': true },
      rubric_items: [baseRubricItem],
    });
    expect(result.appliedRubricItems).toEqual([{ rubric_item_id: 'item-1' }]);
    expect(Array.from(result.appliedRubricDescription)).toEqual(['Correct final answer']);
  });

  it('skips unselected items without throwing', () => {
    const result = parseAiRubricItems({
      ai_rubric_items: { 'Correct final answer': false },
      rubric_items: [baseRubricItem],
    });
    expect(result.appliedRubricItems).toEqual([]);
  });

  it('throws AugmentedError with unknown_descriptions when AI returns a key not in the rubric', () => {
    let thrown: unknown;
    try {
      parseAiRubricItems({
        ai_rubric_items: {
          'Correct final answer': true,
          'Hallucinated rubric item': true,
        },
        rubric_items: [baseRubricItem],
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(error.AugmentedError);
    const data = (thrown as error.AugmentedError).data;
    expect(data.unknown_descriptions).toEqual(['Hallucinated rubric item']);
    expect(data.known_descriptions).toEqual(['Correct final answer']);
  });
});

describe('classifyAiSdkError', () => {
  it('classifies APICallError', () => {
    const err = new APICallError({
      message: 'API call failed',
      url: 'https://example.com',
      requestBodyValues: {},
    });
    expect(classifyAiSdkError(err)).toBe('APICallError');
  });

  it('classifies JSONParseError', () => {
    const err = new JSONParseError({ text: '{', cause: new Error('Unexpected end of JSON') });
    expect(classifyAiSdkError(err)).toBe('JSONParseError');
  });

  it('classifies TypeValidationError', () => {
    const err = new TypeValidationError({ value: {}, cause: new Error('schema mismatch') });
    expect(classifyAiSdkError(err)).toBe('TypeValidationError');
  });

  it('classifies NoObjectGeneratedError', () => {
    const err = new NoObjectGeneratedError({
      message: 'no object',
      cause: new Error('cause'),
      text: undefined,
      response: undefined as any,
      usage: undefined as any,
      finishReason: undefined as any,
    });
    expect(classifyAiSdkError(err)).toBe('NoObjectGeneratedError');
  });

  it('combines outer NoObjectGeneratedError with inner JSONParseError', () => {
    const inner = new JSONParseError({ text: '{', cause: new Error('Unexpected end of JSON') });
    const outer = new NoObjectGeneratedError({
      message: 'no object',
      cause: inner,
      text: undefined,
      response: undefined as any,
      usage: undefined as any,
      finishReason: undefined as any,
    });
    expect(classifyAiSdkError(outer)).toBe('NoObjectGeneratedError/JSONParseError');
  });

  it('unwraps an AugmentedError wrapper to find the inner AI-SDK error', () => {
    const inner = new JSONParseError({ text: '{', cause: new Error('Unexpected end of JSON') });
    const wrapped = new error.AugmentedError('AI grading step "llm_grade" failed', {
      cause: inner,
      data: { step: 'llm_grade' },
    });
    expect(classifyAiSdkError(wrapped)).toBe('JSONParseError');
  });

  it('falls back to err.name for unknown classes', () => {
    class CustomError extends Error {
      override name = 'CustomError';
    }
    expect(classifyAiSdkError(new CustomError('boom'))).toBe('CustomError');
  });

  it('returns UnknownError for non-error throwables', () => {
    expect(classifyAiSdkError('a string')).toBe('UnknownError');
    expect(classifyAiSdkError(null)).toBe('UnknownError');
    expect(classifyAiSdkError(undefined)).toBe('UnknownError');
  });
});

describe('shouldReportToSentry', () => {
  it('skips HttpStatusError (cost / quota / concurrency limits)', () => {
    const err = new error.HttpStatusError(429, 'Hourly usage cap reached');
    expect(shouldReportToSentry('llm_grade', err)).toBe(false);
  });

  it('skips an HttpStatusError wrapped inside an AugmentedError step wrapper', () => {
    const inner = new error.HttpStatusError(429, 'Hourly usage cap reached');
    const wrapped = new error.AugmentedError('AI grading step "llm_grade" failed', {
      cause: inner,
      data: { step: 'llm_grade' },
    });
    expect(shouldReportToSentry('llm_grade', wrapped)).toBe(false);
  });

  it('skips render_question and render_submission steps', () => {
    const err = new Error('render exploded');
    expect(shouldReportToSentry('render_question', err)).toBe(false);
    expect(shouldReportToSentry('render_submission', err)).toBe(false);
  });

  it('reports llm_grade and other unexpected failures', () => {
    const err = new Error('LLM blew up');
    expect(shouldReportToSentry('llm_grade', err)).toBe(true);
    expect(shouldReportToSentry('parse_rubric_items', err)).toBe(true);
    expect(shouldReportToSentry('persist_grading', err)).toBe(true);
    expect(shouldReportToSentry('correct_image_orientations', err)).toBe(true);
  });
});

describe('formatErrorLogEntry', () => {
  it('formats a header-only log entry', () => {
    const log: AIGradingLog = { messageType: 'error', message: 'Something failed' };
    expect(formatErrorLogEntry('[iq=42] ', log)).toBe('[iq=42] Something failed');
  });

  it('includes error class and message but no stack', () => {
    const err = new Error('Unexpected token }');
    err.name = 'AI_JSONParseError';
    const log: AIGradingLog = {
      messageType: 'error',
      message: 'AI grading failed during step "llm_grade"',
      error: err,
    };
    const formatted = formatErrorLogEntry('[iq=99] ', log);
    expect(formatted).toContain('[iq=99] AI grading failed during step "llm_grade"');
    expect(formatted).toContain('Error: AI_JSONParseError: Unexpected token }');
    expect(formatted).not.toContain('at Object.');
    expect(formatted).not.toMatch(/\.ts:\d+/);
  });

  it('renders the JSON context block when present', () => {
    const log: AIGradingLog = {
      messageType: 'error',
      message: 'parse_rubric_items failed',
      error: new Error('boom'),
      context: {
        step: 'parse_rubric_items',
        instance_question_id: '12345',
        unknown_descriptions: ['Hallucinated item'],
      },
    };
    const formatted = formatErrorLogEntry('[iq=12345] ', log);
    expect(formatted).toContain('Context:');
    expect(formatted).toContain('"step": "parse_rubric_items"');
    expect(formatted).toContain('"instance_question_id": "12345"');
    expect(formatted).toContain('"Hallucinated item"');
  });

  it('omits the Context section when context is empty', () => {
    const log: AIGradingLog = {
      messageType: 'error',
      message: 'no context',
      error: new Error('boom'),
      context: {},
    };
    const formatted = formatErrorLogEntry('[iq=1] ', log);
    expect(formatted).not.toContain('Context:');
  });

  it('walks the cause chain so the actionable inner error is preserved', () => {
    const inner = new JSONParseError({ text: '{', cause: new Error('Unexpected token }') });
    const wrapped = new error.AugmentedError('AI grading step "llm_grade" failed', {
      cause: inner,
      data: { step: 'llm_grade', errorClass: 'JSONParseError' },
    });
    const log: AIGradingLog = {
      messageType: 'error',
      message: 'AI grading failed during step "llm_grade"',
      error: wrapped,
      context: { step: 'llm_grade' },
    };
    const formatted = formatErrorLogEntry('[iq=1] ', log);
    // Outer wrapper still rendered (it carries the step name).
    expect(formatted).toContain('AI grading step "llm_grade" failed');
    // Inner JSONParseError details must be present — they are the actionable info.
    expect(formatted).toContain('Caused by: AI_JSONParseError');
    expect(formatted).toContain('Unexpected token }');
  });

  it('stops walking the cause chain when it cycles', () => {
    const a: any = new Error('a');
    const b: any = new Error('b');
    a.cause = b;
    b.cause = a;
    const log: AIGradingLog = { messageType: 'error', message: 'cycle', error: a };
    expect(() => formatErrorLogEntry('[iq=1] ', log)).not.toThrow();
  });
});
