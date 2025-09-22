import clsx from 'clsx';
import { isFragment, isValidElement } from 'preact/compat';
import { render } from 'preact-render-to-string/jsx';
import superjson from 'superjson';

import { compiledScriptPath, compiledScriptPreloadPaths } from '@prairielearn/compiled-assets';
import { AugmentedError } from '@prairielearn/error';
import { type HtmlSafeString, html } from '@prairielearn/html';
import { type ComponentChildren, Fragment, type VNode } from '@prairielearn/preact-cjs';

import { renderHtml } from './index.js';

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
  return superjson.stringify(value).replaceAll(MATCH_HTML, (c) => ENCODE_HTML_RULES[c] || c);
}

/**
 * Render an entire Preact page as an HTML document.
 *
 * @param content - A Preact VNode to render to HTML.
 * @returns An HTML string containing the rendered content.
 */
export function renderHtmlDocument(content: VNode) {
  return `<!doctype html>\n${render(content, {}, { pretty: true, jsx: false })}`;
}

interface HydrateProps {
  /** The component to hydrate */
  children: ComponentChildren;
  /** Optional override for the component's name or displayName */
  nameOverride?: string;
  /** Whether to apply full height styles. */
  fullHeight?: boolean;
}

/**
 * A component that renders a Preact component for client-side hydration.
 * All interactive components will need to be hydrated.
 * This component is intended to be used within a non-interactive Preact component
 * that will be rendered without hydration through `renderHtml`.
 */
export function Hydrate({ children, nameOverride, fullHeight = false }: HydrateProps): VNode {
  if (!isValidElement(children)) {
    throw new Error('<Hydrate> expects a single Preact component as its child');
  }

  if (isFragment(children)) {
    throw new Error('<Hydrate> does not support fragments');
  }

  const content = children as VNode;
  const { type: Component, props } = content;
  if (typeof Component !== 'function') {
    throw new Error('<Hydrate> expects a Preact component');
  }

  // Note that we don't use `Component.name` here because it can be minified or mangled.
  const componentName = nameOverride ?? Component.displayName;
  if (!componentName) {
    // This is only defined in development, not in production when the function name is minified.
    const componentDevName = Component.name || 'UnknownComponent';
    throw new AugmentedError(
      '<Hydrate> expects a component to have a displayName or nameOverride.',
      {
        info: html`
          <div>
            <p>Make sure to add a displayName to the component:</p>
            <pre><code>export const ${componentDevName} = ...;
// Add this line:
${componentDevName}.displayName = '${componentDevName}';</code></pre>
          </div>
        `,
      },
    );
  }

  const scriptPath = `esm-bundles/hydrated-components/${componentName}.ts`;
  let compiledScriptSrc = '';
  try {
    compiledScriptSrc = compiledScriptPath(scriptPath);
  } catch (error) {
    throw new AugmentedError(`Could not find script for component "${componentName}".`, {
      info: html`
        <div>
          Make sure you create a script at
          <code>esm-bundles/hydrated-components/${componentName}.ts</code> registering the
          component:
          <pre><code>import { registerHydratedComponent } from '@prairielearn/preact/hydrated-component';

import { ${componentName} } from './path/to/component.js';

registerHydratedComponent(${componentName});</code></pre>
        </div>
      `,
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
      <div
        data-component={componentName}
        class={clsx('js-hydrated-component', { 'h-100': fullHeight })}
      >
        <script
          type="application/json"
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: escapeJsonForHtml(props),
          }}
          data-component-props
        />
        <div class={fullHeight ? 'h-100' : ''} data-component-root>
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
  return renderHtml(<Hydrate>{content}</Hydrate>);
}
