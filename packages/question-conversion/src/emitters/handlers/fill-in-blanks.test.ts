import { assert, describe, it } from 'vitest';

import { fillInBlanksHandler } from './fill-in-blanks.js';

const blanks = [
  { id: 'blank1', correctText: 'hello', ignoreCase: false },
  { id: 'blank2', correctText: 'world', ignoreCase: true },
];

describe('fillInBlanksHandler.transformPrompt', () => {
  it('replaces blank placeholders with pl-string-input elements', () => {
    const prompt = fillInBlanksHandler.transformPrompt!('Say [blank1] [blank2]!', {
      type: 'fill-in-blanks',
      blanks,
    });
    assert.include(prompt, '<pl-string-input answers-name="blank1" correct-answer="hello"');
    assert.include(prompt, '<pl-string-input answers-name="blank2" correct-answer="world"');
    assert.notInclude(prompt, '[blank1]');
    assert.notInclude(prompt, '[blank2]');
  });

  it('adds ignore-case="true" for case-insensitive blanks', () => {
    const prompt = fillInBlanksHandler.transformPrompt!('Type [blank2]', {
      type: 'fill-in-blanks',
      blanks,
    });
    assert.include(prompt, 'ignore-case="true"');
  });

  it('omits ignore-case when blank.ignoreCase is false', () => {
    const prompt = fillInBlanksHandler.transformPrompt!('Type [blank1]', {
      type: 'fill-in-blanks',
      blanks,
    });
    assert.notInclude(prompt, 'ignore-case');
  });

  it('includes remove-leading-trailing="true"', () => {
    const prompt = fillInBlanksHandler.transformPrompt!('[blank1]', {
      type: 'fill-in-blanks',
      blanks,
    });
    assert.include(prompt, 'remove-leading-trailing="true"');
  });
});

describe('fillInBlanksHandler.renderHtml', () => {
  it('always returns empty string (inputs are inlined in prompt)', () => {
    const html = fillInBlanksHandler.renderHtml({ type: 'fill-in-blanks', blanks });
    assert.equal(html, '');
  });
});

describe('fillInBlanksHandler.renderGradePy', () => {
  it('returns empty string when no feedback', () => {
    const py = fillInBlanksHandler.renderGradePy!({ type: 'fill-in-blanks', blanks }, undefined);
    assert.equal(py, '');
  });

  it('returns empty string when perAnswer does not match any blank', () => {
    const py = fillInBlanksHandler.renderGradePy!(
      { type: 'fill-in-blanks', blanks },
      { perAnswer: { unrelated: 'msg' } },
    );
    assert.equal(py, '');
  });

  it('generates grade function checking partial_scores for matched blanks', () => {
    const py = fillInBlanksHandler.renderGradePy!(
      { type: 'fill-in-blanks', blanks },
      { perAnswer: { hello: 'You got blank1!', world: 'You got blank2!' } },
    );
    assert.include(py, 'def grade(data):');
    assert.include(py, '_messages = []');
    assert.include(py, 'partial_scores');
    assert.include(py, '"blank1"');
    assert.include(py, '"blank2"');
    assert.include(py, 'data["feedback"]["general"]');
  });

  it('appends global correct/incorrect feedback', () => {
    const py = fillInBlanksHandler.renderGradePy!(
      { type: 'fill-in-blanks', blanks },
      { correct: 'All correct!', incorrect: 'Try again', perAnswer: { hello: 'Nice' } },
    );
    assert.include(py, '"All correct!"');
    assert.include(py, '"Try again"');
  });

  it('generates grade function from global-only feedback (no perAnswer)', () => {
    const py = fillInBlanksHandler.renderGradePy!(
      { type: 'fill-in-blanks', blanks },
      { correct: 'Great job!' },
    );
    assert.include(py, 'def grade(data):');
    assert.include(py, '"Great job!"');
  });

  it('emits feedback as a JSON-encoded string literal so special characters are safe', () => {
    // Feedback that would explode inside an f-string: {braces} would get evaluated,
    // backslashes would misbehave, unescaped quotes and newlines would break syntax.
    const feedback = 'has "quotes", {braces}, \\back\\slash, and\nnewline';
    const py = fillInBlanksHandler.renderGradePy!(
      { type: 'fill-in-blanks', blanks },
      { perAnswer: { hello: feedback } },
    );
    assert.include(py, JSON.stringify(`<strong>hello</strong>: ${feedback}`));
  });
});
