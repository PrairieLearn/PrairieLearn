import { assert, describe, it } from 'vitest';

import { sanitizeHtml } from './sanitize.js';

describe('sanitizeHtml', () => {
  it('sanitizes content while preserving supported markup and references', () => {
    const html = [
      '<div class="alert position-fixed" style="inset: 0">',
      '<style>body { color: red }</style><script>alert(1)</script>',
      '<h2 id="instructions"><strong>Instructions</strong></h2>',
      '<p class="mathjax_ignore extra tex2jax_ignore">$5</p>',
      '<button type="button" class="btn btn-info" aria-label="Help" data-bs-toggle="popover" data-bs-html="true" data-bs-content="&lt;img src=x onerror=alert(1)&gt;" data-clipboard-target="body">Help</button>',
      '<img src="/image.png" onerror="alert(1)">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<svg onload="alert(1)"></svg>',
      '<a href="/formulas.pdf" target="_blank">Formula sheet</a>',
      '<a href="/formulas.pdf" target="_BLANK" rel="nofollow noreferrer">Formula sheet</a>',
      '<a href="/first">First</a><a href="/second" target="_self">Second</a>',
      '<a href="javascript:alert(1)" target="_blank" onclick="alert(1)">Link</a>',
      '<a href="java&#x73;cript:alert(1)">Encoded link</a>',
      '<a name="legacy"></a><a href="#instructions">Jump</a><a href="#legacy">Legacy</a>',
      '<p aria-controls="testing" aria-labelledby="instructions legacy" role="dialog">Details</p>',
      '<form action="/submit"><label for="answer">Answer</label><input id="answer" name="answer"></form>',
      '<dialog open>Dialog</dialog><select><option>Choice</option></select>',
      '<table><caption>Points</caption><thead><tr><th scope="col">Question</th></tr></thead><tbody><tr><td colspan="2">10</td></tr></tbody></table>',
      '<a href="https://example.com/#instructions">External</a>',
      '</div>',
    ].join('');
    const expected = [
      '<div>',
      '<h2 id="user-content-instructions"><strong>Instructions</strong></h2>',
      '<p class="mathjax_ignore tex2jax_ignore">$5</p>',
      'Help',
      '<img src="/image.png">',
      '<a href="/formulas.pdf" target="_blank" rel="noopener noreferrer">Formula sheet</a>',
      '<a href="/formulas.pdf" target="_BLANK" rel="nofollow noreferrer noopener">Formula sheet</a>',
      '<a href="/first">First</a><a href="/second" target="_self">Second</a>',
      '<a target="_blank" rel="noopener noreferrer">Link</a>',
      '<a>Encoded link</a>',
      '<a name="user-content-legacy"></a><a href="#user-content-instructions">Jump</a><a href="#user-content-legacy">Legacy</a>',
      '<p>Details</p>',
      'Answer',
      'DialogChoice',
      '<table><caption>Points</caption><thead><tr><th scope="col">Question</th></tr></thead><tbody><tr><td colspan="2">10</td></tr></tbody></table>',
      '<a href="https://example.com/#instructions">External</a>',
      '</div>',
    ].join('');

    assert.equal(sanitizeHtml(html), expected);
  });
});
