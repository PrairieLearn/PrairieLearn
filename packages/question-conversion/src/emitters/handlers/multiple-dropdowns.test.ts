import { assert, describe, it } from 'vitest';

import { multipleDropdownsHandler } from './multiple-dropdowns.js';

const blanks = [
  {
    id: 'blank1',
    choices: [
      { id: 'a', html: 'Red', correct: true },
      { id: 'b', html: 'Blue', correct: false },
    ],
  },
  {
    id: 'blank2',
    choices: [{ id: 'c', html: 'Circle', correct: true }],
  },
];

describe('multipleDropdownsHandler.transformPrompt', () => {
  it('replaces blank placeholders with pl-multiple-choice dropdown elements', () => {
    const prompt = multipleDropdownsHandler.transformPrompt!('Color: [blank1], Shape: [blank2]', {
      type: 'multiple-dropdowns',
      blanks,
    });
    assert.include(prompt, '<pl-multiple-choice answers-name="blank1" display="dropdown">');
    assert.include(prompt, '<pl-multiple-choice answers-name="blank2" display="dropdown">');
    assert.notInclude(prompt, '[blank1]');
    assert.notInclude(prompt, '[blank2]');
  });

  it('renders correct and incorrect answers inside each dropdown', () => {
    const prompt = multipleDropdownsHandler.transformPrompt!('[blank1]', {
      type: 'multiple-dropdowns',
      blanks,
    });
    assert.include(prompt, '<pl-answer correct="true">Red</pl-answer>');
    assert.include(prompt, '<pl-answer correct="false">Blue</pl-answer>');
  });

  it('escapes special characters in blank ids', () => {
    const specialBlanks = [
      {
        id: 'a"b',
        choices: [{ id: 'x', html: 'X', correct: true }],
      },
    ];
    const prompt = multipleDropdownsHandler.transformPrompt!('[a"b]', {
      type: 'multiple-dropdowns',
      blanks: specialBlanks,
    });
    assert.include(prompt, 'answers-name="a&quot;b"');
  });
});

describe('multipleDropdownsHandler.renderHtml', () => {
  it('always returns empty string (dropdowns are inlined in prompt)', () => {
    const html = multipleDropdownsHandler.renderHtml({ type: 'multiple-dropdowns', blanks });
    assert.equal(html, '');
  });
});
