import { assert, describe, it } from 'vitest';

import { numericHandler } from './numeric.js';

describe('numericHandler.renderHtml', () => {
  it('renders with correct-answer and no tolerance', () => {
    const html = numericHandler.renderHtml({
      type: 'numeric',
      answer: { correctValue: 42 },
    });
    assert.equal(
      html,
      '<pl-number-input answers-name="answer" correct-answer="42"></pl-number-input>',
    );
  });

  it('includes atol when tolerance is provided', () => {
    const html = numericHandler.renderHtml({
      type: 'numeric',
      answer: { correctValue: 3.14, tolerance: 0.01 },
    });
    assert.include(html, 'correct-answer="3.14"');
    assert.include(html, 'atol="0.01"');
  });

  it('omits atol when tolerance is undefined', () => {
    const html = numericHandler.renderHtml({
      type: 'numeric',
      answer: { correctValue: 100 },
    });
    assert.notInclude(html, 'atol=');
  });

  it('renders negative correct answer', () => {
    const html = numericHandler.renderHtml({
      type: 'numeric',
      answer: { correctValue: -5.5 },
    });
    assert.include(html, 'correct-answer="-5.5"');
  });
});
