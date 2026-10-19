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
const ID_REFERENCE_ATTRIBUTES = new Set([
  'for',
  'headers',
  'list',
  'form',
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
]);

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

    for (const attribute of node.attributes) {
      if (ID_REFERENCE_ATTRIBUTES.has(attribute.name)) {
        attribute.value = attribute.value.replaceAll(/\S+/g, (id) => `${USER_CONTENT_PREFIX}${id}`);
      } else if (
        ['href', 'xlink:href', 'usemap'].includes(attribute.name) &&
        attribute.value.startsWith('#') &&
        attribute.value.length > 1
      ) {
        attribute.value = `#${USER_CONTENT_PREFIX}${attribute.value.slice(1)}`;
      }
    }

    if (node.localName !== 'a' || node.getAttribute('target')?.toLowerCase() !== '_blank') return;

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
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['style'],
    SANITIZE_NAMED_PROPS: true,
    ADD_ATTR: (attributeName, tagName) => attributeName === 'target' && tagName === 'a',
  });
}
