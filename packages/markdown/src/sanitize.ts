import assert from 'assert';

import createDOMPurify from 'dompurify';
import { Window } from 'happy-dom';

/**
 * `happy-dom` will leak memory if a single `Window` instance is used indefinitely.
 * To mitigate this, we recreate both the `Window` and `DOMPurify` instances after
 * a set number of uses.
 *
 * 1000 was chosen as a reasonable balance between performance and memory usage.
 *
 * See `benchmark.ts` for memory usage benchmarking.
 */
const INSTANCE_MAX_USES = 1000;

interface SanitizeInstance {
  window: Window;
  dompurify: ReturnType<typeof createDOMPurify>;
  uses: number;
}

let instance: SanitizeInstance | null = null;

export async function sanitizeHtml(html: string): Promise<string> {
  if (!instance || instance.uses >= INSTANCE_MAX_USES) {
    // Clean up the window from the old instance if it exists.
    //
    // NOTE: it's very important that we await the `close()` operation, as we
    // need to ensure that we yield to the event loop to allow `happy-dom` to
    // finalize the cleanup of its resources.
    await instance?.window.happyDOM.close();

    // Create a new instance.
    const window = new Window();
    const dompurify = createDOMPurify(window as any);
    instance = { window, dompurify, uses: 0 };

    // Sanity check: make sure that DOMPurify is fully supported.
    assert(dompurify.isSupported);
  }

  instance.uses += 1;
  return instance.dompurify.sanitize(html);
}
