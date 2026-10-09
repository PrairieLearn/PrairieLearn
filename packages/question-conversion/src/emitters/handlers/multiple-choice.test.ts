import { assert, describe, it } from 'vitest';

import { multipleChoiceHandler } from './multiple-choice.js';

const twoChoices = [
  { id: 'a', html: 'Red', correct: false },
  { id: 'b', html: 'Blue', correct: true },
];

describe('multipleChoiceHandler', () => {
  it('renders basic multiple-choice', () => {
    const html = multipleChoiceHandler.renderHtml({ type: 'multiple-choice', choices: twoChoices });
    assert.equal(
      html,
      '<pl-multiple-choice answers-name="answer">\n  <pl-answer correct="false">Red</pl-answer>\n  <pl-answer correct="true">Blue</pl-answer>\n</pl-multiple-choice>',
    );
  });

  it('preserves HTML in choice content', () => {
    const html = multipleChoiceHandler.renderHtml({
      type: 'multiple-choice',
      choices: [{ id: 'a', html: 'O(n<sup>2</sup>)', correct: true }],
    });
    assert.include(html, '>O(n<sup>2</sup>)<');
  });

  it('adds order="fixed" when shuffleAnswers is false', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      false,
    );
    assert.include(html, 'order="fixed"');
  });

  it('omits order attribute when shuffleAnswers is undefined', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      undefined,
    );
    assert.notInclude(html, 'order=');
  });

  it('renders dropdown display variant', () => {
    const html = multipleChoiceHandler.renderHtml({
      type: 'multiple-choice',
      choices: twoChoices,
      display: 'dropdown',
    });
    assert.include(html, 'display="dropdown"');
    assert.include(html, '<pl-multiple-choice answers-name="answer" display="dropdown">');
  });

  it('dropdown omits order attribute even when shuffleAnswers is false', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices, display: 'dropdown' },
      false,
    );
    assert.notInclude(html, 'order=');
  });

  it('includes per-answer feedback attributes', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      undefined,
      { Red: 'Wrong color', Blue: 'Correct!' },
    );
    assert.include(html, 'feedback="Wrong color"');
    assert.include(html, 'feedback="Correct!"');
  });

  it('escapes special characters in feedback', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      undefined,
      { Red: '<b>Wrong</b>' },
    );
    assert.include(html, 'feedback="&lt;b&gt;Wrong&lt;/b&gt;"');
  });

  it('keeps Mustache delimiters in feedback attributes literal', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      undefined,
      { Red: '{{double_brace}} and {{{triple_brace}}}' },
    );
    assert.include(
      html,
      'feedback="&#123;&#123;double_brace&#125;&#125; and &#123;&#123;&#123;triple_brace&#125;&#125;&#125;"',
    );
    assert.notInclude(html, '{{double_brace}}');
    assert.notInclude(html, '{{{triple_brace}}}');
  });

  it('disables built-in grading and feedback when no choice is correct', () => {
    const html = multipleChoiceHandler.renderHtml(
      {
        type: 'multiple-choice',
        choices: twoChoices.map((choice) => ({ ...choice, correct: false })),
      },
      undefined,
      { Red: 'Interesting!', Blue: 'Cool!' },
    );
    assert.include(html, '<pl-multiple-choice answers-name="answer" builtin-grading="false">');
    assert.notInclude(html, 'feedback=');
  });

  it('disables built-in grading for a dropdown with no correct choice', () => {
    const html = multipleChoiceHandler.renderHtml({
      type: 'multiple-choice',
      display: 'dropdown',
      choices: twoChoices.map((choice) => ({ ...choice, correct: false })),
    });
    assert.include(
      html,
      '<pl-multiple-choice answers-name="answer" display="dropdown" builtin-grading="false">',
    );
  });

  it('deduplicates choices preferring correct one', () => {
    const html = multipleChoiceHandler.renderHtml({
      type: 'multiple-choice',
      choices: [
        { id: 'a', html: 'Same', correct: false },
        { id: 'b', html: 'Same', correct: true },
      ],
    });
    const matches = html.match(/Same/g);
    assert.equal(matches?.length, 1);
    assert.include(html, 'correct="true"');
  });
});
