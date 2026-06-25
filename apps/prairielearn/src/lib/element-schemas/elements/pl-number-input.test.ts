import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-number-input schema', () => {
  it('accepts a blank correct answer for Python semantic validation', async () => {
    const messages = await lintMessages(`
      <pl-number-input
        answers-name="blank-number"
        allow-blank="true"
        blank-value=""
        correct-answer=""
      ></pl-number-input>
    `);

    assert.deepEqual(messages, []);
  });
});
