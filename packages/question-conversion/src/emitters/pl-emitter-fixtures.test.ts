import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { assert, describe, expect, it } from 'vitest';

import { convert } from '../pipeline.js';
import type { PLQuestionOutput } from '../types/pl-output.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const FIXTURE_NAMES = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function readFixture(name: string, filename: string): string {
  return readFileSync(path.join(FIXTURES, name, filename), 'utf8');
}

function normalizeTerminalNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function normalizeOptionalTerminalNewline(value: string | undefined): string | undefined {
  return value == null ? undefined : normalizeTerminalNewline(value);
}

async function emitFixture(name: string): Promise<PLQuestionOutput> {
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

    const expectedServerPyPath = path.join(FIXTURES, name, 'server.py');
    const expectedServerPy = existsSync(expectedServerPyPath)
      ? readFileSync(expectedServerPyPath, 'utf8')
      : undefined;
    expect(expectedServerPy?.trim()).not.toBe('');
    expect(normalizeOptionalTerminalNewline(question.serverPy)).toBe(
      normalizeOptionalTerminalNewline(expectedServerPy),
    );
  });
});
