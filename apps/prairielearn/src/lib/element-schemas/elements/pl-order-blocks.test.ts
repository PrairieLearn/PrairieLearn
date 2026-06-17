import { assert, describe, it } from 'vitest';

import { validateHTML } from '../../../ee/lib/validateHTML.js';
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

  it('warns on deprecated attributes', async () => {
    const warnings = await lintWarnings(`
      <pl-order-blocks answers-name="blocks" inline="true">
        <pl-answer correct="true">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(
      warnings.some((message) => message.includes('"inline"') && message.includes('deprecated')),
    );
  });

  it('allows validateHTML to accept order blocks', async () => {
    const result = await validateHTML(
      `
        <pl-order-blocks answers-name="blocks">
          <pl-answer correct="true">A</pl-answer>
        </pl-order-blocks>
      `,
      false,
    );

    assert.deepEqual(result.errors, []);
  });
});
