import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-checkbox schema', () => {
  it('accepts schema-valid checkbox markup', async () => {
    const messages = await lintMessages(`
      <pl-checkbox answers-name="choice" order="fixed" partial-credit="coverage">
        <pl-answer correct="true">A</pl-answer>
        <pl-answer feedback="Try again">B</pl-answer>
      </pl-checkbox>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects disallowed child tags', async () => {
    const messages = await lintMessages(`
      <pl-checkbox answers-name="choice">
        <p>A</p>
      </pl-checkbox>
    `);

    assert.isTrue(messages.some((message) => message.includes('only allows these child elements')));
  });

  it('applies the checkbox pl-answer schema only inside checkbox', async () => {
    const messages = await lintMessages(`
      <pl-checkbox answers-name="choice">
        <pl-answer score="1">A</pl-answer>
      </pl-checkbox>
    `);

    assert.isTrue(messages.some((message) => message.includes('score')));
  });
});
