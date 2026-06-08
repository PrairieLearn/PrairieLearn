import { assert, describe, it } from 'vitest';

import { validateHTML } from '../../../ee/lib/validateHTML.js';
import { lintQuestionHtml } from '../../question-html-linter.js';

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

    assert.deepEqual(messages, [
      '<pl-order-blocks> is missing required attribute "answers-name".',
      'Input element is missing the required `answers-name` attribute.',
    ]);
  });

  it('rejects unknown attributes and additional child tags', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" bogus="true">
        <p>A</p>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, [
      'Unknown attribute "bogus" on <pl-order-blocks>.',
      '<pl-order-blocks> only allows these child elements: <pl-answer>, <pl-block-group>.',
      'pl-order-blocks element must have at least 1 answer block.',
    ]);
  });

  it('rejects invalid attribute values', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="sequence" max-incorrect="1.5">
        <pl-answer correct="maybe" indent="0.5">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, [
      'Attribute "grading-method" on <pl-order-blocks> must be one of: "unordered", "ordered", "ranking", "dag", "external".',
      'Attribute "max-incorrect" on <pl-order-blocks> must match format "integer".',
      'Attribute "correct" on <pl-answer> inside <pl-order-blocks> must match format "boolean".',
      'Attribute "indent" on <pl-answer> inside <pl-order-blocks> must match format "integer".',
      '<pl-answer> should not specify indentation if indentation is disabled.',
    ]);
  });

  it('rejects answer attributes incompatible with the grading method', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="external">
        <pl-answer ranking="1">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, [
      'pl-answer: ranking is not valid with this pl-order-blocks grading method.',
    ]);
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

    assert.deepEqual(messages, [
      'code-language attribute may only be used with format="code".',
      'feedback type first-wrong is not available with the ordered grading-method.',
      'indentation may not be used when inline is true.',
    ]);
  });

  it('rejects optional blocks without a final answer', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks" grading-method="dag">
        <pl-answer correct="true" tag="a" depends="b|c">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, [
      "Use of optional lines requires 'final' attributes on all true <pl-answer> blocks that appear at the end of a valid ordering.",
    ]);
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
