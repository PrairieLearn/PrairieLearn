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
    assert.include(html, '<pl-checkbox answers-name="answer" partial-credit="net-correct">');
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

  it('does not include feedback attributes in HTML', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices });
    assert.notInclude(html, 'feedback=');
  });
});
