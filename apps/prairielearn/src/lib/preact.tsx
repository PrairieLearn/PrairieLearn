import { isFragment } from 'preact/compat';
import { render } from 'preact-render-to-string/jsx';

import { compiledScriptPath, compiledScriptPreloadPaths } from '@prairielearn/compiled-assets';
import { AugmentedError } from '@prairielearn/error';
import { type HtmlSafeString, html } from '@prairielearn/html';
import { Fragment, type VNode } from '@prairielearn/preact-cjs';

import { renderHtml } from './preact-html.js';

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
 * @param nameOverride - An optional override for the component's name or displayName.
 * @returns A Preact VNode that can be used for client-side hydration.
 */
export function hydrate<T>(content: VNode<T>, nameOverride?: string): VNode {
  const { type: Component, props } = content;
  if (typeof Component !== 'function') {
    throw new Error('hydrate expects a Preact component');
  }

  if (isFragment(content)) {
    throw new Error('Cannot render a fragment for hydration.');
  }

  const componentName = nameOverride || Component.name || Component.displayName;
  if (!componentName) {
    throw new Error(
      'Component does not have a name or displayName -- provide a nameOverride for the component, or give it a name.',
    );
  }
  const scriptPath = `esm-bundles/react-fragments/${componentName}.ts`;
  let compiledScriptSrc = '';
  try {
    compiledScriptSrc = compiledScriptPath(scriptPath);
  } catch (error) {
    throw new AugmentedError(`Could not find script for component "${componentName}".`, {
      info: html`<div>
        Make sure you create a script at <code>esm-bundles/react-fragments/${componentName}.ts</code> registering the fragment in the registry:
        <pre>
        <code>
import { ${componentName} } from // ...
import { registerReactFragment } from '../../behaviors/react-fragments/index.js';

registerReactFragment(${componentName});
        </code>
        <pre>
      </div> `,
      cause: error,
    });
  }
  const scriptPreloads = compiledScriptPreloadPaths(scriptPath);
  return (
    <Fragment>
      <script type="module" src={compiledScriptSrc} />
      {scriptPreloads.map((preloadPath) => (
        <link key={preloadPath} rel="modulepreload" href={preloadPath} />
      ))}
      <div data-component={componentName} class="js-react-fragment">
        <script
          type="application/json"
          data-component-props
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: escapeJsonForHtml(props),
          }}
        />
        <div data-component-root>
          <Component {...props} />
        </div>
      </div>
    </Fragment>
  );
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
