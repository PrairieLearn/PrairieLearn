import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-string-input schema', () => {
  it('accepts schema-valid string input markup', async () => {
    const messages = await lintMessages(`
      <pl-string-input
        answers-name="string"
        correct-answer-format="regex"
        multiline="true"
      ></pl-string-input>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects invalid correct answer formats', async () => {
    const messages = await lintMessages(`
      <pl-string-input answers-name="string" correct-answer-format="glob"></pl-string-input>
    `);

    assert.isTrue(messages.some((message) => message.includes('correct-answer-format')));
  });
});
