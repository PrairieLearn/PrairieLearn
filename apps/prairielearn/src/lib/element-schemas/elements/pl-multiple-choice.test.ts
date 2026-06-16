import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

async function lintWarnings(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-multiple-choice schema', () => {
  it('accepts schema-valid multiple-choice markup', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" order="fixed">
        <pl-answer correct="true" score=".5">A</pl-answer>
        <pl-answer>B</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects disallowed child tags', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <p>A</p>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('only allows these child elements')));
  });

  it('applies the multiple-choice pl-answer schema only inside multiple-choice', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer ranking="1">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('ranking')));
  });

  it('does not apply the multiple-choice answer schema to other owners', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks">
        <pl-answer correct="true">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('warns on deprecated attributes', async () => {
    const warnings = await lintWarnings(`
      <pl-multiple-choice answers-name="choice" fixed-order="true" inline="true">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(warnings.some((m) => m.includes('"fixed-order"') && m.includes('deprecated')));
    assert.isTrue(warnings.some((m) => m.includes('"inline"') && m.includes('deprecated')));
  });
});
