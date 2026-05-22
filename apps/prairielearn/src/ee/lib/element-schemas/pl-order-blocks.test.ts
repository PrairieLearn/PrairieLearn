import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../htmlMustacheLinterNode.js';
import { validateHTML } from '../validateHTML.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map((diagnostic) => diagnostic.message);
}

describe('pl-order-blocks schema', () => {
  it('accepts a valid ordered order-blocks element', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" source-blocks-order="ordered">
        <pl-answer correct="true">First</pl-answer>
        <pl-answer correct="true">Second</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('accepts DAG block groups', async () => {
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

  it('accepts DAG order blocks where every answer is in a block group', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="dag">
        <pl-block-group tag="case-a">
          <pl-answer correct="true" tag="a1">First case</pl-answer>
          <pl-answer correct="true" tag="a2" depends="a1">Finish case</pl-answer>
        </pl-block-group>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('counts incorrect answers inside DAG block groups', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="dag" max-incorrect="1">
        <pl-block-group tag="case-a">
          <pl-answer correct="false" tag="a1">Distractor</pl-answer>
        </pl-block-group>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('requires answers-name', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks>
        <pl-answer>A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes('answers-name')));
  });

  it('rejects unknown attributes and additional child tags', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" bogus="true">
        <p>A</p>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes('bogus')));
    assert.isTrue(messages.some((message) => message.includes('only allows these child elements')));
  });

  it('rejects invalid attribute values', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="sequence" max-incorrect="1.5">
        <pl-answer correct="maybe" indent="0.5">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes('grading-method')));
    assert.isTrue(messages.some((message) => message.includes('pl-integer')));
    assert.isTrue(messages.some((message) => message.includes('correct')));
    assert.isTrue(messages.some((message) => message.includes('indent')));
  });

  it('rejects answer attributes incompatible with the grading method', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="external">
        <pl-answer ranking="1">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes('ranking')));
  });

  it('validates cross-attribute constraints', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks
        answers-name="blocks"
        code-language="python"
        feedback="first-wrong"
        grading-method="ordered"
        inline="true"
        indentation="true"
      >
        <pl-answer correct="true">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes('format="code"')));
    assert.isTrue(messages.some((message) => message.includes('feedback type first-wrong')));
    assert.isTrue(messages.some((message) => message.includes('indentation may not be used')));
  });

  it('rejects optional blocks without a final answer', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="dag">
        <pl-answer correct="true" tag="a" depends="b|c">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.isTrue(messages.some((message) => message.includes("requires 'final'")));
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
