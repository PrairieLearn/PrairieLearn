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

describe('fillInBlanksHandler.renderFeedback', () => {
  it('returns no messages when feedback is absent', () => {
    const feedback = fillInBlanksHandler.renderFeedback!(
      { type: 'fill-in-blanks', blanks },
      undefined,
    );
    assert.deepEqual(feedback, []);
  });

  it('returns no messages when feedback does not match any blank', () => {
    const feedback = fillInBlanksHandler.renderFeedback!(
      { type: 'fill-in-blanks', blanks },
      { unrelated: 'msg' },
    );
    assert.deepEqual(feedback, []);
  });

  it('describes feedback for each matching blank', () => {
    const feedback = fillInBlanksHandler.renderFeedback!(
      { type: 'fill-in-blanks', blanks },
      { hello: 'You got blank1!', world: 'You got blank2!' },
    );
    assert.deepEqual(feedback, [
      {
        html: '<strong>hello</strong>: You got blank1!',
        trigger: { type: 'fill-in-the-blank-correct', answerName: 'blank1' },
      },
      {
        html: '<strong>world</strong>: You got blank2!',
        trigger: { type: 'fill-in-the-blank-correct', answerName: 'blank2' },
      },
    ]);
  });
});
