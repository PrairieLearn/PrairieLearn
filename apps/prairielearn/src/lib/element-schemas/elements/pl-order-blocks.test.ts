import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../../question-html-linter.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-order-blocks schema', () => {
  it('accepts schema-valid order-blocks markup', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" source-blocks-order="ordered">
        <pl-answer correct="true">First</pl-answer>
        <pl-answer correct="true">Second</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('accepts DAG block groups with nested answers', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="dag">
        <pl-block-group tag="case-a">
          <pl-answer correct="true" tag="a1">First case</pl-answer>
          <pl-answer correct="true" tag="a2" depends="a1">Finish case</pl-answer>
        </pl-block-group>
        <pl-answer correct="true" tag="z" depends="case-a">Conclusion</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });
});
