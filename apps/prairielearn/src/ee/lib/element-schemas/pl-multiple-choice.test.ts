import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../htmlMustacheLinterNode.js';

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

  it('requires answers-name', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice>
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('answers-name')));
  });

  it('rejects unknown attributes and additional child tags', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" bogus="true">
        <p>A</p>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('bogus')));
    assert.isTrue(messages.some((message) => message.includes('only allows these child elements')));
  });

  it('rejects invalid attribute values', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" weight="1.5" display="grid">
        <pl-answer correct="maybe" score="1.5">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('pl-integer')));
    assert.isTrue(messages.some((message) => message.includes('display')));
    assert.isTrue(messages.some((message) => message.includes('correct')));
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

    assert.isTrue(messages.some((message) => message.includes('numeric value')));
  });

  it('requires dropdown display for size and placeholder', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" size="5" placeholder="Pick one">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((m) => m.includes('display to "dropdown"')));
  });

  it('requires matching all/none of the above attributes for feedback', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" all-of-the-above-feedback="All">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isNotEmpty(messages);
  });

  it('restricts grading attributes when builtin grading is disabled', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" weight="1">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(
      messages.some((m) => m.includes('"weight" should not be set when builtin-grading is false.')),
    );
  });

  it('rejects feedback when disabled builtin grading option is false alias', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" all-of-the-above="0" all-of-the-above-feedback="Feedback">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isNotEmpty(messages);
  });

  it('rejects duplicate answer inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>A</pl-answer>
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('duplicate child inner HTML')));
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

    assert.isFalse(messages.some((message) => message.includes('duplicate child inner HTML')));
  });
});
