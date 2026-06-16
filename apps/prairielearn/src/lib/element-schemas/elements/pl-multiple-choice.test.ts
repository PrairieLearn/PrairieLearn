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

  it('allows scores outside the Python-enforced semantic range', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer correct="true" score="1.5">A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
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

    assert.isTrue(messages.some((message) => message.includes('match format "number"')));
  });

  it('allows dropdown-only attributes without checking display mode', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" size="5" placeholder="Pick one">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows all/none feedback attributes without checking matching options', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" all-of-the-above-feedback="All">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows grading attributes without checking builtin-grading mode', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" weight="1">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows grading-specific all-of-the-above values without checking builtin-grading mode', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice" builtin-grading="false" all-of-the-above="correct">
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows duplicate answer inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>A</pl-answer>
        <pl-answer>A</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows answers with identical Mustache inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>{{ params.A }}</pl-answer>
        <pl-answer>{{ params.A }}</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows answers with differing Mustache inner HTML', async () => {
    const messages = await lintMessages(`
      <pl-multiple-choice answers-name="choice">
        <pl-answer>{{ params.A }}</pl-answer>
        <pl-answer>{{ params.B }}</pl-answer>
      </pl-multiple-choice>
    `);

    assert.deepEqual(messages, []);
  });

  it('allows external-json without inline answers', async () => {
    const messages = await lintMessages(
      '<pl-multiple-choice answers-name="choice" external-json="answers.json"></pl-multiple-choice>',
    );

    assert.deepEqual(messages, []);
  });

  it('allows empty answer children without checking fallback semantics', async () => {
    const messages = await lintMessages(
      '<pl-multiple-choice answers-name="choice"></pl-multiple-choice>',
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
});
