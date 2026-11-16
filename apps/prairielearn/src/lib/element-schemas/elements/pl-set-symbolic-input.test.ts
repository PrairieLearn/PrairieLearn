import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-set-symbolic-input schema', () => {
  it('accepts set-input attributes', async () => {
    const messages = await lintMessages(`
      <pl-set-symbolic-input
        answers-name="set"
        variables="x"
        correct-answer="R - {x}"
        formula-editor="true"
      ></pl-set-symbolic-input>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects general symbolic set-parser controls', async () => {
    for (const attribute of ['allow-sets="true"', 'allowed-types="interval"']) {
      const messages = await lintMessages(`
        <pl-set-symbolic-input answers-name="set" ${attribute}></pl-set-symbolic-input>
      `);
      assert.isTrue(messages.some((message) => message.includes(attribute.split('=')[0])));
    }
  });
});
