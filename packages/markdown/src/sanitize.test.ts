import { assert, it } from 'vitest';

import { sanitizeHtml } from './sanitize.js';

it('removes data attributes only when requested for that call', () => {
  const html = '<span class="badge" data-bs-toggle="popover" aria-label="Help">Help</span>';
  assert.equal(
    sanitizeHtml(html, { allowDataAttributes: false }),
    '<span class="badge" aria-label="Help">Help</span>',
  );
  assert.equal(sanitizeHtml(html), html);
});
