import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import he from 'he';
import mustache from 'mustache';
import { assert, describe, expect, it } from 'vitest';

import { convert } from '../pipeline.js';
import { QtiImportRemoteImageCopier } from '../remote-image-copier.js';
import type { PLQuestionOutput } from '../types/pl-output.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const FIXTURE_NAMES = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const FIXTURE_REMOTE_IMAGE_CONTENT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function readFixture(name: string, filename: string): string {
  return readFileSync(path.join(FIXTURES, name, filename), 'utf8');
}

function normalizeTerminalNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function normalizeOptionalTerminalNewline(value: string | undefined): string | undefined {
  return value == null ? undefined : normalizeTerminalNewline(value);
}

function readExpectedClientFiles(name: string): Map<string, Buffer> {
  const directory = path.join(FIXTURES, name, 'clientFilesQuestion');
  if (!existsSync(directory)) return new Map();

  return new Map(
    readdirSync(directory, { withFileTypes: true }).map((entry) => {
      assert.isTrue(entry.isFile());
      const filePath = path.join(directory, entry.name);
      if (entry.name.endsWith('.base64')) {
        return [
          entry.name.slice(0, -'.base64'.length),
          Buffer.from(readFileSync(filePath, 'utf8').trim(), 'base64'),
        ];
      }
      return [entry.name, readFileSync(filePath)];
    }),
  );
}

async function emitFixture(name: string): Promise<{
  question: PLQuestionOutput;
  reports: Awaited<ReturnType<typeof convert>>['reports'];
  requestedUrls: string[];
}> {
  const requestedUrls: string[] = [];
  const remoteImageCopier = new QtiImportRemoteImageCopier(async (url) => {
    requestedUrls.push(url.href);
    return { content: FIXTURE_REMOTE_IMAGE_CONTENT, extension: 'png' };
  });
  const result = await convert(readFixture(name, 'question.xml'), {
    processors: [remoteImageCopier],
  });
  assert.deepEqual(result.warnings, []);
  assert.lengthOf(result.questions, 1);
  return { question: result.questions[0], reports: result.reports, requestedUrls };
}

describe('PLEmitter output fixtures', () => {
  it.each(FIXTURE_NAMES)('emits %s', async (name) => {
    const { question } = await emitFixture(name);

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
    expect(question.clientFiles).toEqual(readExpectedClientFiles(name));
  });

  it('preserves imported Mustache delimiters without evaluating them', async () => {
    const { question } = await emitFixture('mustache-delimiters');
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

  it('resolves copied-image URLs without evaluating imported Mustache delimiters', async () => {
    const { question, reports, requestedUrls } = await emitFixture('question-with-copied-images');
    const renderedHtml = mustache.render(question.questionHtml, {
      feedback: { overall: { is_correct: true } },
      imported_per_answer_value: 'MUSTACHE_EVALUATED',
      imported_entity_value: 'ENTITY_EVALUATED',
      options: { client_files_question_url: '/client-files-question' },
    });

    assert.deepEqual(requestedUrls, ['https://canvas.example/files/diagram.png?verifier=secret']);
    assert.deepEqual(reports, [
      {
        type: 'remote-image-copy',
        questionId: 'question-with-copied-images',
        filesCreated: 1,
      },
    ]);
    assert.notInclude(renderedHtml, 'MUSTACHE_EVALUATED');
    assert.notInclude(renderedHtml, 'ENTITY_EVALUATED');

    const decodedHtml = he.decode(renderedHtml);
    assert.include(decodedHtml, '/client-files-question/remote-431ced6916a2a21a.png');
    assert.include(decodedHtml, '{{imported_per_answer_value}}');
    assert.include(decodedHtml, '{{ options.client_files_question_url }}');
    assert.include(he.decode(decodedHtml), '{{imported_entity_value}}');
  });
});
