import { render } from 'preact-render-to-string/jsx';

import { type HtmlSafeString, html, unsafeHtml } from '@prairielearn/html';
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
export function renderHtml(vnode: VNode | null): HtmlSafeString {
  if (vnode === null) {
    return html``;
  }
  return unsafeHtml(render(vnode, {}, { pretty: false, jsx: false }));
}
