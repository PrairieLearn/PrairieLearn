import type { VNode } from 'preact';
import { render } from 'preact-render-to-string/jsx';

import { unsafeHtml, type HtmlSafeString } from '@prairielearn/html';

// This function must live outside of `preact.tsx` so that it can be imported
// on the client. `preact.tsx` imports `@prairielearn/compiled-assets`, which
// cannot be bundled for the browser.

export function renderHtml(vnode: VNode): HtmlSafeString {
  return unsafeHtml(render(vnode, {}, { pretty: true, jsx: false }));
}
