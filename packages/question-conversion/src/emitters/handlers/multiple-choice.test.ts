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

  it('renders choice feedback as a native feedback attribute', () => {
    const html = multipleChoiceHandler.renderHtml(
      { type: 'multiple-choice', choices: twoChoices },
      undefined,
      {
        perChoice: new Map([
          ['b', '<p>{{imported_value}} <img src="question-asset://feedback.png"></p>'],
        ]),
      },
    );
    assert.include(html, '<pl-answer correct="false">Red</pl-answer>');
    assert.include(
      html,
      '<pl-answer correct="true" feedback="&lt;p&gt;&amp;#123;&amp;#123;imported_value&amp;#125;&amp;#125; &lt;img src=&quot;{{ options.client_files_question_url }}/feedback.png&quot;&gt;&lt;/p&gt;">Blue</pl-answer>',
    );
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

  it('disables built-in grading and feedback when no choice is correct', () => {
    const html = multipleChoiceHandler.renderHtml(
      {
        type: 'multiple-choice',
        choices: twoChoices.map((choice) => ({ ...choice, correct: false })),
      },
      undefined,
      { perChoice: new Map([['a', 'Interesting!']]) },
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
