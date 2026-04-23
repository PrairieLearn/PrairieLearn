import { assert, describe, it } from 'vitest';

import { checkboxHandler } from './checkbox.js';

const choices = [
  { id: 'a', html: 'Apple', correct: true },
  { id: 'b', html: 'Banana', correct: false },
  { id: 'c', html: 'Cherry', correct: true },
];

describe('checkboxHandler.renderHtml', () => {
  it('renders basic checkbox list', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices });
    assert.include(html, '<pl-checkbox answers-name="answer">');
    assert.include(html, '<pl-answer correct="true">Apple</pl-answer>');
    assert.include(html, '<pl-answer correct="false">Banana</pl-answer>');
    assert.include(html, '</pl-checkbox>');
  });

  it('adds order="fixed" when shuffleAnswers is false', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, false);
    assert.include(html, 'order="fixed"');
  });

  it('omits order attribute when shuffleAnswers is undefined', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined);
    assert.notInclude(html, 'order=');
  });

  it('does not include feedback attributes in HTML (per-answer handled in grade())', () => {
    const html = checkboxHandler.renderHtml(
      { type: 'checkbox', choices },
      undefined,
      { Apple: 'Correct!' },
    );
    assert.notInclude(html, 'feedback=');
  });
});

describe('checkboxHandler.renderGradePy', () => {
  it('returns empty string when no perAnswer feedback', () => {
    const py = checkboxHandler.renderGradePy!({ type: 'checkbox', choices }, undefined);
    assert.equal(py, '');
  });

  it('returns empty string when perAnswer is empty', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { perAnswer: {} },
    );
    assert.equal(py, '');
  });

  it('generates grade function with feedback map', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { perAnswer: { Apple: 'Good choice', Banana: 'Not a fruit salad item' } },
    );
    assert.include(py, 'def grade(data):');
    assert.include(py, '_feedback_map = {');
    assert.include(py, '"Apple": "Good choice"');
    assert.include(py, '"Banana": "Not a fruit salad item"');
    assert.include(py, '_submitted = data["submitted_answers"].get("answer") or []');
    assert.include(py, '_messages');
    assert.include(py, 'data["feedback"]["general"]');
  });

  it('appends global correct feedback', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { correct: 'Well done!', perAnswer: { Apple: 'Yes' } },
    );
    assert.include(py, 'data["score"] >= 1.0');
    assert.include(py, '"Well done!"');
  });

  it('appends global incorrect feedback', () => {
    const py = checkboxHandler.renderGradePy!(
      { type: 'checkbox', choices },
      { incorrect: 'Try again', perAnswer: { Apple: 'Yes' } },
    );
    assert.include(py, 'data["score"] < 1.0');
    assert.include(py, '"Try again"');
  });
});
