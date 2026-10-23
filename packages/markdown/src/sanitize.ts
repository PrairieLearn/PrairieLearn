import assert from 'node:assert';

import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * `jsdom` will leak memory if a single `Window` instance is used indefinitely.
 * To mitigate this, we recreate both the `jsdom` and `dompurify` instances after
 * a set number of uses.
 *
 * 1000 was chosen as a reasonable balance between performance and memory usage.
 *
 * See `benchmark.ts` for memory usage benchmarking.
 */
const INSTANCE_MAX_USES = 1000;

// DOMPurify uses this prefix when SANITIZE_NAMED_PROPS is enabled.
const USER_CONTENT_PREFIX = 'user-content-';

interface SanitizeInstance {
  jsdom: JSDOM;
  dompurify: ReturnType<typeof createDOMPurify>;
  uses: number;
}

let instance: SanitizeInstance | null = null;

function getOrCreateInstance(): SanitizeInstance {
  if (instance && instance.uses < INSTANCE_MAX_USES) {
    instance.uses += 1;
    return instance;
  }

  // Clean up the window from the old instance if it exists.
  instance?.jsdom.window.close();

  // Create a new instance.
  const jsdom = new JSDOM('');
  const dompurify = createDOMPurify(jsdom.window as any);

  dompurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('class')) {
      // These classes suppress math interpretation without activating UI behavior.
      const classes = [...node.classList].filter(
        (name) => name === 'mathjax_ignore' || name === 'tex2jax_ignore',
      );
      if (classes.length > 0) node.setAttribute('class', classes.join(' '));
      else node.removeAttribute('class');
    }

    if (node.localName !== 'a') return;

    const href = node.getAttribute('href');
    if (href?.startsWith('#') && href.length > 1) {
      node.setAttribute('href', `#${USER_CONTENT_PREFIX}${href.slice(1)}`);
    }

    if (node.getAttribute('target')?.toLowerCase() !== '_blank') return;

    const rel = new Set(node.getAttribute('rel')?.split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    node.setAttribute('rel', [...rel].join(' '));
  });

  // Sanity check: make sure that DOMPurify is fully supported.
  assert(dompurify.isSupported);

  instance = { jsdom, dompurify, uses: 1 };
  return instance;
}

export function sanitizeHtml(html: string): string {
  const instance = getOrCreateInstance();
  return instance.dompurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a',
      'abbr',
      'b',
      'blockquote',
      'br',
      'caption',
      'code',
      'col',
      'colgroup',
      'dd',
      'del',
      'div',
      'dl',
      'dt',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'i',
      'img',
      'ins',
      'kbd',
      'li',
      'ol',
      'p',
      'pre',
      'q',
      's',
      'samp',
      'small',
      'span',
      'strong',
      'sub',
      'sup',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
      'var',
      'wbr',
    ],
    ALLOWED_ATTR: [
      'align',
      'alt',
      'cite',
      'class',
      'colspan',
      'datetime',
      'dir',
      'height',
      'href',
      'id',
      'lang',
      'name',
      'rel',
      'reversed',
      'rowspan',
      'scope',
      'src',
      'start',
      'title',
      'type',
      'width',
    ],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    ADD_ATTR: (attributeName, tagName) => attributeName === 'target' && tagName === 'a',
  });
}
