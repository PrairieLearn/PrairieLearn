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

  it('preserves HTML in choice content', () => {
    const html = checkboxHandler.renderHtml({
      type: 'checkbox',
      choices: [{ id: 'a', html: 'x<sub>0</sub>', correct: true }],
    });
    assert.include(html, '>x<sub>0</sub><');
  });

  it('adds order="fixed" when shuffleAnswers is false', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, false);
    assert.include(html, 'order="fixed"');
  });

  it('omits order attribute when shuffleAnswers is undefined', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined);
    assert.notInclude(html, 'order=');
  });

  it('includes escaped feedback for matching answers', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined, {
      Apple: '<strong>Good & "ripe"</strong>',
      Durian: 'Not an emitted answer',
    });
    assert.include(html, 'feedback="&lt;strong&gt;Good &amp; &quot;ripe&quot;&lt;/strong&gt;"');
    assert.notInclude(html, 'Not an emitted answer');
  });

  it('keeps Mustache delimiters in feedback attributes literal', () => {
    const html = checkboxHandler.renderHtml({ type: 'checkbox', choices }, undefined, {
      Apple: '{{double_brace}} and {{{triple_brace}}}',
    });
    assert.include(
      html,
      'feedback="&#123;&#123;double_brace&#125;&#125; and &#123;&#123;&#123;triple_brace&#125;&#125;&#125;"',
    );
    assert.notInclude(html, '{{double_brace}}');
    assert.notInclude(html, '{{{triple_brace}}}');
  });

  it('deduplicates choices preferring the correct one', () => {
    const html = checkboxHandler.renderHtml({
      type: 'checkbox',
      choices: [
        { id: 'a', html: 'Same', correct: false },
        { id: 'b', html: 'Same', correct: true },
      ],
    });
    assert.equal(html.match(/>Same</g)?.length, 1);
    assert.include(html, 'correct="true">Same<');
  });
});
