import { assert, describe, it } from 'vitest';

import { sanitizeHtml } from './sanitize.js';

describe('sanitizeHtml', () => {
  it.each([
    ['inline scripts', '<p>Instructions</p><script>alert(1)</script>', '<p>Instructions</p>'],
    ['image error handlers', '<img src="/image.png" onerror="alert(1)">', '<img src="/image.png">'],
    ['encoded JavaScript URLs', '<a href="java&#x73;cript:alert(1)">Link</a>', '<a>Link</a>'],
    [
      'iframe content',
      '<p>Instructions</p><iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<p>Instructions</p>',
    ],
    ['SVG event handlers', '<svg onload="alert(1)"></svg>', '<svg></svg>'],
  ])('removes %s', (_name, html, expected) => {
    assert.equal(sanitizeHtml(html), expected);
  });

  it.each([
    [
      'popover content',
      'data-bs-toggle="popover" data-bs-html="true" data-bs-content="&lt;img src=x onerror=alert(1)&gt;"',
    ],
    ['clipboard behaviors', 'data-clipboard-target="body"'],
  ])('removes data attributes that activate %s', (_name, attributes) => {
    const html = `<button type="button" class="btn btn-info" aria-label="Help" ${attributes}>Help</button>`;
    assert.equal(
      sanitizeHtml(html),
      '<button type="button" class="btn btn-info" aria-label="Help">Help</button>',
    );
  });
});
