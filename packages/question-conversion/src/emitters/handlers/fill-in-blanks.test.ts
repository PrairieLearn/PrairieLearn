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
