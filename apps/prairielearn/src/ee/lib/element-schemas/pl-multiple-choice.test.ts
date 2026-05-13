import { assert, describe, it } from 'vitest';

import { lintQuestionHtml } from '../htmlMustacheLinterNode.js';

async function lintMessages(html: string): Promise<string[]> {
  const diagnostics = await lintQuestionHtml(html);
  return diagnostics.map((diagnostic) => diagnostic.message);
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

  it('rejects unknown attributes and invalid children', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" bogus="true">
        <p>A</p>
      </pl-multiple-choice>
    `);

    assert.isTrue(messages.some((message) => message.includes('bogus')));
    assert.isTrue(messages.some((message) => message.includes('only allows <pl-answer>')));
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

  it('accepts score strings parsed by Python float', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer correct="true" score=".5">A</pl-answer>
        <pl-answer>B</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('requires dropdown display for size and placeholder', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" size="5" placeholder="Pick one">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.isAtLeast(messages.length, 2);
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
      <pl-multiple-choice answers-name="choice" builtin-grading="false" weight="1" hide-score-badge="true" all-of-the-above="random">
        <pl-answer score="0.5" feedback="Partial">A</pl-answer>
      </pl-multiple-choice>
    `);

    const joined = messages.join('\n');
    assert.include(joined, '"weight" should not be set when builtin-grading is false.');
    assert.include(
      joined,
      '"hide-score-badge" should not be set when builtin-grading is false.',
    );
    assert.include(
      joined,
      '"all-of-the-above" should be set to true or false when builtin-grading is false.',
    );
    assert.include(joined, '"score" on pl-answer should not be set when builtin-grading is false.');
    assert.include(
      joined,
      '"feedback" on pl-answer should not be set when builtin-grading is false.',
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
