import { assert, describe, it } from 'vitest';

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

describe('pl-multiple-choice schema', () => {
  it('accepts a valid multiple-choice element', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" order="fixed">
        <pl-answer correct="true" score="1">A</pl-answer>
        <pl-answer>B</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects disallowed child tags', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <p>A</p>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('only allows these child elements')));
  });

  it('rejects scores outside the [0.0, 1.0] range', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer correct="true" score="1.5">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('range')));
  });

  it('rejects attributes from other pl-answer owners', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer ranking="1">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('ranking')));
  });

  it('does not apply the multiple-choice answer schema to other owners', async () => {
    const messages = await lintMessages(`
      <pl-order-blocks answers-name="blocks">
        <pl-answer correct="true">A</pl-answer>
      </pl-order-blocks>
    `);

    assert.deepEqual(messages, []);
  });

  it('accepts score strings parsed by Python float', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer correct="true" score=".5">A</pl-answer>
        <pl-answer>B</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('rejects non-numeric scores', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer correct="true" score="abc">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('must be a number in the range')));
  });

  it('requires dropdown display for size and placeholder', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" size="5" placeholder="Pick one">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((m) => m.includes('is only allowed when "display" is "dropdown"')));
  });

  it('requires matching all/none of the above attributes for feedback', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" all-of-the-above-feedback="All">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(
      messages.some((m) =>
        m.includes(
          'Attribute "all-of-the-above-feedback" on <pl-multiple-choice> is only allowed when "all-of-the-above" is enabled.',
        ),
      ),
    );
  });

  it('restricts grading attributes when builtin grading is disabled', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" weight="1">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(
      messages.some((m) =>
        m.includes(
          'Attribute "weight" on <pl-multiple-choice> is only allowed when "builtin-grading" is true.',
        ),
      ),
    );
  });

  it('rejects grading-specific all-of-the-above values when builtin grading is disabled', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" all-of-the-above="correct">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(
      messages.some((m) =>
        m.includes(
          'Attribute "all-of-the-above" on <pl-multiple-choice> cannot use the grading values "correct", "incorrect", or "random" when "builtin-grading" is false.',
        ),
      ),
    );
  });

  it('rejects duplicate answer inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>A</pl-answer>
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('has a duplicate answer choice')));
  });

  it('flags answers with identical Mustache as duplicate inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>{{ params.A }}</pl-answer>
        <pl-answer>{{ params.A }}</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(
      messages.some((message) =>
        message.includes('has a duplicate answer choice: "{{ params.A }}"'),
      ),
    );
  });

  it('does not flag answers with differing Mustache as duplicate inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>{{ params.A }}</pl-answer>
        <pl-answer>{{ params.B }}</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isFalse(messages.some((message) => message.includes('has a duplicate answer choice')));
  });

  it('allows external-json without inline answers', async () => {
    const messages = await lintMessages(
      '<pl-multiple-choice answers-name="choice" external-json="answers.json"></pl-multiple-choice>',
    );

    assert.deepEqual(messages, []);
  });

  it('warns on deprecated attributes', async () => {
    const warnings = await lintWarnings(`
      <pl-multiple-choice answers-name="choice" fixed-order="true" inline="true">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(warnings.some((m) => m.includes('"fixed-order"') && m.includes('deprecated')));
    assert.isTrue(warnings.some((m) => m.includes('"inline"') && m.includes('deprecated')));
  });

  it('allows answers with matching text but different HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer><code>x</code></pl-answer>
        <pl-answer><strong>x</strong></pl-answer>
      </pl-multiple-choice>
    `);

    assert.isFalse(messages.some((message) => message.includes('has a duplicate answer choice')));
  });
});
