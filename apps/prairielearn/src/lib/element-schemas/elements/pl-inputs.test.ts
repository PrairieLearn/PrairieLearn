import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('AI-supported input schemas', () => {
  it('accepts schema-valid input markup', async () => {
    const messages = await lintMessages(`
      <pl-integer-input answers-name="integer" base="16" correct-answer="ff"></pl-integer-input>
      <pl-number-input answers-name="number" comparison="sigfig" digits="3"></pl-number-input>
      <pl-string-input
        answers-name="string"
        correct-answer-format="regex"
        multiline="true"
      ></pl-string-input>
      <pl-symbolic-input
        answers-name="symbolic"
        allow-complex="true"
        imaginary-unit-for-display="j"
      ></pl-symbolic-input>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects invalid enum values on schema-backed input markup', async () => {
    const messages = await lintMessages(`
      <pl-string-input answers-name="string" correct-answer-format="glob"></pl-string-input>
      <pl-symbolic-input answers-name="symbolic" imaginary-unit-for-display="k"></pl-symbolic-input>
    `);

    assert.isTrue(messages.some((message) => message.includes('correct-answer-format')));
    assert.isTrue(messages.some((message) => message.includes('imaginary-unit-for-display')));
  });
});
