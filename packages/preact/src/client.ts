import { render } from 'preact-render-to-string/jsx';

import { HtmlSafeString, escapeHtml, unsafeHtml } from '@prairielearn/html';
import { type ComponentType, type VNode } from '@prairielearn/preact-cjs';

import { registry } from './react-fragment/index.js';

// These functions are separated from the other utilities so that they can be imported
// on the client. `index.tsx` imports `@prairielearn/compiled-assets`, which
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

export function registerReactFragment(component: ComponentType<any>, nameOverride?: string) {
  // Each React component that will be hydrated on the page must be registered.
  // Note that we don't try to use `component.name` since it can be minified or mangled.
  const id = nameOverride ?? component.displayName;
  if (!id) {
    throw new Error('React fragment must have a displayName or nameOverride');
  }
  registry.setReactFragment(id, component);
}
