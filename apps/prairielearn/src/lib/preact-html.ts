import { render } from 'preact-render-to-string/jsx';

import { type HtmlSafeString, unsafeHtml } from '@prairielearn/html';
import type { VNode } from '@prairielearn/preact-cjs';

// This function must live outside of `preact.tsx` so that it can be imported
// on the client. `preact.tsx` imports `@prairielearn/compiled-assets`, which
// cannot be bundled for the browser.

/**
 * This function should only be called as a aid for migration from client-side code to Preact.
 * It allows authoring a piece of client-side code as Preact.
 * Server-side rendering (e.g. pages/foo.html.tsx) should use `renderHtml` instead.
 *
 * @param vnode - A Preact VNode to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function renderPreactToHtmlForClientSide(vnode: VNode): HtmlSafeString {
  return unsafeHtml(render(vnode, {}, { pretty: false, jsx: false }));
}
