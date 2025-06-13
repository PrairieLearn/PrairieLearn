/* eslint-disable @typescript-eslint/no-unused-vars */
import { render } from 'preact-render-to-string/jsx';

import { compiledScriptPath } from '@prairielearn/compiled-assets';
import { type HtmlSafeString } from '@prairielearn/html';
import {
  type Attributes,
  type ComponentType,
  Fragment,
  type VNode,
} from '@prairielearn/preact-cjs';

import { renderPreactToHtmlForClientSide } from './preact-html.js';

/**
 * Render a non-interactive Preact component that is embedded within a tagged template literal.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param content - A Preact VNode to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
function renderHtml(content: VNode): HtmlSafeString {
  return renderPreactToHtmlForClientSide(content);
}

// Based on https://pkg.go.dev/encoding/json#HTMLEscape
const ENCODE_HTML_RULES: Record<string, string> = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
const MATCH_HTML = /[&><\u2028\u2029]/g;

/**
 * Escape a value for use in a JSON string that will be rendered in HTML.
 *
 * @param value - The value to escape.
 * @returns A JSON string with HTML-sensitive characters escaped.
 */
function escapeJsonForHtml(value: any): string {
  return JSON.stringify(value).replace(MATCH_HTML, (c) => ENCODE_HTML_RULES[c] || c);
}

/**
 * Render an entire Preact page as an HTML document.
 *
 * @param content - A Preact VNode to render to HTML.
 * @returns An HTML string containing the rendered content.
 */
export function renderHtmlDocument(content: VNode) {
  // If you want to
  return `<!doctype html>\n${render(content, {}, { pretty: true, jsx: false })}`;
}

/**
 * Renders a Preact component for client-side hydration. All interaactive components will need to be hydrated.
 * This function is intended to be used within a non-interactive Preact component that will be rendered without hydration through `renderHtml`.
 *
 * @param content - A Preact VNode to render to HTML.
 * @returns A Preact VNode that can be used for client-side hydration.
 */
export function hydrate<T>(content: VNode<T>): VNode {
  const { type: Component, props } = content;
  if (typeof Component !== 'function') {
    throw new Error('hydrate expects a Preact component');
  }

  if (!Component.displayName && !Component.name) {
    throw new Error('Component does not have a displayName or name.');
  }
  const randomId = Math.random().toString(36).slice(2, 10);
  // If we have multiple fragments on the page, we need to ensure that each one has a unique ID
  const id = `${Component.displayName || Component.name}-${randomId}`;
  const scriptPath = `split-bundles/react-fragments/${id}.ts`;
  throw new Error('Waiting for PR #12157');
  // const scriptPreloads = compiledScriptPreloadPaths(scriptPath);
  // return (
  //   <Fragment>
  //     <script type="module" src={compiledScriptPath(scriptPath)} />
  //     {scriptPreloads.map((preloadPath) => (
  //       <link key={preloadPath} rel="modulepreload" href={preloadPath} />
  //     ))}
  //     <div id={id} class="js-react-fragment">
  //       <script
  //         type="application/json"
  //         id={`${id}-props`}
  //         // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
  //         dangerouslySetInnerHTML={{
  //           __html: escapeJsonForHtml(props),
  //         }}
  //       />
  //       <div id={`${id}-root`}>
  //         <Component {...props} />
  //       </div>
  //     </div>
  //   </Fragment>
  // );
}

/**
 * Renders a Preact component for client-side hydration and returns an HTML-safe string.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param content - A Preact VNode to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function hydrateHtml<T>(content: VNode<T>): HtmlSafeString {
  // Useful for adding Preact components to existing tagged-template pages.
  return renderHtml(hydrate(content));
}
