import { assert, describe, it } from 'vitest';

import { integerHandler } from './integer.js';

describe('integerHandler.renderHtml', () => {
  it('renders pl-integer-input with correct-answer', () => {
    const html = integerHandler.renderHtml({
      type: 'integer',
      answer: { correctValue: 7 },
    });
    assert.equal(
      html,
      '<pl-integer-input answers-name="answer" correct-answer="7"></pl-integer-input>',
    );
  });

  it('renders negative integer', () => {
    const html = integerHandler.renderHtml({
      type: 'integer',
      answer: { correctValue: -42 },
    });
    assert.include(html, 'correct-answer="-42"');
  });

  it('renders zero', () => {
    const html = integerHandler.renderHtml({
      type: 'integer',
      answer: { correctValue: 0 },
    });
    assert.include(html, 'correct-answer="0"');
  });
});
