import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-drawing schema', () => {
  it('accepts built-in drawing objects in the answer, initial, and group containers', async () => {
    const messages = await lintMessages(`
      <pl-drawing gradable="true">
        <pl-drawing-initial>
          <pl-point x1="100" y1="100"></pl-point>
          <pl-drawing-group>
            <pl-vector x1="50" y1="50" width="80"></pl-vector>
          </pl-drawing-group>
        </pl-drawing-initial>
        <pl-drawing-answer>
          <pl-vector x1="50" y1="50"></pl-vector>
        </pl-drawing-answer>
      </pl-drawing>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows extension-defined object tags via allowAdditionalChildren', async () => {
    const messages = await lintMessages(`
      <pl-drawing gradable="true">
        <pl-drawing-initial>
          <pl-my-extension-object some-attr="1"></pl-my-extension-object>
        </pl-drawing-initial>
      </pl-drawing>
    `);

    assert.deepEqual(messages, []);
  });

  it('validates the attributes of built-in drawing objects', async () => {
    const messages = await lintMessages(`
      <pl-drawing gradable="true">
        <pl-drawing-initial>
          <pl-point x1="1" y1="1" not-a-real-attr="x"></pl-point>
        </pl-drawing-initial>
      </pl-drawing>
    `);

    assert.isTrue(messages.some((message) => message.includes('not-a-real-attr')));
  });
});
