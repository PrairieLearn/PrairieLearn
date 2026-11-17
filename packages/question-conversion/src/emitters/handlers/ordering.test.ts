import { assert, describe, it } from 'vitest';

import { orderingHandler } from './ordering.js';

describe('orderingHandler.renderHtml', () => {
  it('renders pl-order-blocks with correct-order items', () => {
    const html = orderingHandler.renderHtml({
      type: 'ordering',
      correctOrder: [
        { id: '1', html: 'First step' },
        { id: '2', html: 'Second step' },
        { id: '3', html: 'Third step' },
      ],
    });
    assert.include(html, '<pl-order-blocks answers-name="answer">');
    assert.include(html, '<pl-answer correct="true">First step</pl-answer>');
    assert.include(html, '<pl-answer correct="true">Second step</pl-answer>');
    assert.include(html, '<pl-answer correct="true">Third step</pl-answer>');
    assert.include(html, '</pl-order-blocks>');
  });

  it('all answers have correct="true"', () => {
    const html = orderingHandler.renderHtml({
      type: 'ordering',
      correctOrder: [
        { id: 'a', html: 'A' },
        { id: 'b', html: 'B' },
      ],
    });
    assert.notInclude(html, 'correct="false"');
  });

  it('renders single item', () => {
    const html = orderingHandler.renderHtml({
      type: 'ordering',
      correctOrder: [{ id: 'x', html: 'Only item' }],
    });
    assert.include(html, 'Only item');
    assert.include(html, '<pl-order-blocks answers-name="answer">');
  });
});
