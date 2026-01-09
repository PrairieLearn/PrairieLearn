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

  // Sanity check: make sure that DOMPurify is fully supported.
  assert(dompurify.isSupported);

  instance = { jsdom, dompurify, uses: 1 };
  return instance;
}

export function sanitizeHtml(html: string): string {
  const instance = getOrCreateInstance();
  return instance.dompurify.sanitize(html);
}
