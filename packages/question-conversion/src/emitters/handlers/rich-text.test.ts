import { assert, describe, it } from 'vitest';

import { richTextHandler } from './rich-text.js';

describe('richTextHandler.renderHtml', () => {
  it('returns pl-rich-text-editor with fixed file-name', () => {
    const html = richTextHandler.renderHtml({ type: 'rich-text', gradingMethod: 'Manual' });
    assert.equal(html, '<pl-rich-text-editor file-name="answer.html"></pl-rich-text-editor>');
  });
});
