import { assert, describe, it } from 'vitest';

import { stringInputHandler } from './string-input.js';

describe('stringInputHandler.renderHtml', () => {
  it('renders pl-string-input with correct-answer', () => {
    const html = stringInputHandler.renderHtml({
      type: 'string-input',
      correctAnswer: 'photosynthesis',
    });
    assert.equal(
      html,
      '<pl-string-input answers-name="answer" correct-answer="photosynthesis" remove-leading-trailing="true"></pl-string-input>',
    );
  });

  it('includes ignore-case="true" when ignoreCase is set', () => {
    const html = stringInputHandler.renderHtml({
      type: 'string-input',
      correctAnswer: 'hello',
      ignoreCase: true,
    });
    assert.include(html, 'ignore-case="true"');
  });

  it('omits ignore-case when ignoreCase is false', () => {
    const html = stringInputHandler.renderHtml({
      type: 'string-input',
      correctAnswer: 'hello',
      ignoreCase: false,
    });
    assert.notInclude(html, 'ignore-case');
  });

  it('includes remove-leading-trailing="true" always', () => {
    const html = stringInputHandler.renderHtml({
      type: 'string-input',
      correctAnswer: 'test',
    });
    assert.include(html, 'remove-leading-trailing="true"');
  });

  it('escapes special characters in correct-answer', () => {
    const html = stringInputHandler.renderHtml({
      type: 'string-input',
      correctAnswer: '"quoted" & <special>',
    });
    assert.include(html, 'correct-answer="&quot;quoted&quot; &amp; &lt;special&gt;"');
  });
});
