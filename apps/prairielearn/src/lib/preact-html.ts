import { render } from 'preact-render-to-string/jsx';

import { HtmlSafeString, escapeHtml, unsafeHtml } from '@prairielearn/html';
import type { VNode } from '@prairielearn/preact-cjs';

// This function must live outside of `preact.tsx` so that it can be imported
// on the client. `preact.tsx` imports `@prairielearn/compiled-assets`, which
// cannot be bundled for the browser.

/**
 * Render a non-interactive Preact component that is embedded within a tagged template literal.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param vnode - A Preact VNode to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function renderHtml(vnode: VNode | string): HtmlSafeString {
  let pretty = false;

  // In development mode, render HTML with pretty formatting. This is easier to
  // debug, especially in test cases. This will only do anything on the server,
  // but that's fine as we won't ever be looking at HTML that's rendered on the client.
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    pretty = true;
  }

  if (typeof vnode === 'string') {
    return escapeHtml(new HtmlSafeString([vnode], []));
  }

  return unsafeHtml(render(vnode, {}, { pretty, jsx: false }));
}
