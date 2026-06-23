import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-integer-input schema', () => {
  it('accepts schema-valid integer input markup', async () => {
    const messages = await lintMessages(`
      <pl-integer-input answers-name="integer" base="16" correct-answer="ff"></pl-integer-input>
    `);

    assert.deepEqual(messages, []);
  });
});
