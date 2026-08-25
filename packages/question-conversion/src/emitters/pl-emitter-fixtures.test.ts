import { readFileSync } from 'node:fs';
import path from 'node:path';

import he from 'he';
import mustache from 'mustache';
import { assert, describe, expect, it } from 'vitest';

import { convert } from '../pipeline.js';
import type { PLQuestionOutput } from '../types/pl-output.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const FIXTURE_NAMES = ['multiple-choice', 'checkbox', 'fill-in-blanks'] as const;

function readFixture(name: (typeof FIXTURE_NAMES)[number], filename: string): string {
  return readFileSync(path.join(FIXTURES, name, filename), 'utf8');
}

function normalizeTerminalNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

async function emitFixture(name: (typeof FIXTURE_NAMES)[number]): Promise<PLQuestionOutput> {
  const result = await convert(readFixture(name, 'question.xml'));
  assert.deepEqual(result.warnings, []);
  assert.lengthOf(result.questions, 1);
  return result.questions[0];
}

describe('PLEmitter output fixtures', () => {
  it.each(FIXTURE_NAMES)('emits %s', async (name) => {
    const question = await emitFixture(name);

    expect(normalizeTerminalNewline(question.questionHtml)).toBe(
      normalizeTerminalNewline(readFixture(name, 'question.html')),
    );
    expect(normalizeTerminalNewline(question.serverPy ?? '')).toBe(
      normalizeTerminalNewline(readFixture(name, 'server.py')),
    );
  });

  it('preserves imported Mustache delimiters without evaluating them', async () => {
    const question = await emitFixture('multiple-choice');
    const renderedHtml = mustache.render(question.questionHtml, {
      feedback: { overall: true },
      double_brace_value: 'DOUBLE_BRACE_EVALUATED',
      triple_brace_value: 'TRIPLE_BRACE_EVALUATED',
    });

    assert.notInclude(renderedHtml, 'DOUBLE_BRACE_EVALUATED');
    assert.notInclude(renderedHtml, 'TRIPLE_BRACE_EVALUATED');

    const decodedHtml = he.decode(renderedHtml);
    assert.include(decodedHtml, '{{double_brace_value}}');
    assert.include(decodedHtml, '{{{triple_brace_value}}}');
  });
});
