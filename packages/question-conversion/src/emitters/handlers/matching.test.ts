import { assert, describe, it } from 'vitest';

import { matchingHandler } from './matching.js';

describe('matchingHandler.renderHtml', () => {
  it('renders pairs and distractors', () => {
    const html = matchingHandler.renderHtml({
      type: 'matching',
      pairs: [
        { statementHtml: 'Cat', optionHtml: 'Meow' },
        { statementHtml: 'Dog', optionHtml: 'Woof' },
      ],
      distractors: [{ optionHtml: 'Moo' }],
    });
    assert.include(html, '<pl-matching answers-name="answer">');
    assert.include(html, '<pl-statement match="Meow">Cat</pl-statement>');
    assert.include(html, '<pl-statement match="Woof">Dog</pl-statement>');
    assert.include(html, '<pl-option>Moo</pl-option>');
    assert.include(html, '</pl-matching>');
  });

  it('renders with no distractors', () => {
    const html = matchingHandler.renderHtml({
      type: 'matching',
      pairs: [{ statementHtml: 'A', optionHtml: 'B' }],
      distractors: [],
    });
    assert.notInclude(html, '<pl-option>');
    assert.include(html, '<pl-statement match="B">A</pl-statement>');
  });

  it('escapes special characters in option html match attribute', () => {
    const html = matchingHandler.renderHtml({
      type: 'matching',
      pairs: [{ statementHtml: 'Test', optionHtml: '<em>italic</em>' }],
      distractors: [],
    });
    assert.include(html, 'match="&lt;em&gt;italic&lt;/em&gt;"');
  });
});
