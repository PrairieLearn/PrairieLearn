import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-symbolic-input schema', () => {
  it('accepts schema-valid symbolic input markup', async () => {
    const messages = await lintMessages(`
      <pl-symbolic-input
        answers-name="symbolic"
        additional-simplifications="expand, trigsimp"
        allow-complex="true"
        imaginary-unit-for-display="j"
      ></pl-symbolic-input>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects invalid imaginary units for display', async () => {
    const messages = await lintMessages(`
      <pl-symbolic-input answers-name="symbolic" imaginary-unit-for-display="k"></pl-symbolic-input>
    `);

    assert.isTrue(messages.some((message) => message.includes('imaginary-unit-for-display')));
  });

  it('rejects unsupported symbolic simplification names', async () => {
    const messages = await lintMessages(`
      <pl-symbolic-input
        answers-name="symbolic"
        additional-simplifications="expand, bogus"
      ></pl-symbolic-input>
    `);

    assert.isTrue(messages.some((message) => message.includes('additional-simplifications')));
  });
});
