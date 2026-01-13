import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';

import { HtmlSafeString, escapeHtml, unsafeHtml } from '@prairielearn/html';

// These functions are separated from the other utilities so that they can be imported
// on both the client and the server. `server.tsx` imports `@prairielearn/compiled-assets`,
// which cannot be bundled for the browser.

/**
 * Render a non-interactive Preact component that is embedded within a tagged template literal.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param node - Contents to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function renderHtml(node: ReactNode | string): HtmlSafeString {
  if (typeof node === 'string') {
    return escapeHtml(new HtmlSafeString([node], []));
  }

  return unsafeHtml(renderToString(node));
}
