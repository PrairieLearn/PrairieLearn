import { assert, describe, it } from 'vitest';

import { textOnlyHandler } from './text-only.js';

describe('textOnlyHandler.renderHtml', () => {
  it('returns empty string (no interactive element needed)', () => {
    const html = textOnlyHandler.renderHtml({ type: 'text-only' });
    assert.equal(html, '');
  });
});
